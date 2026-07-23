import type { FiiDividendRow } from "@/lib/dividends-types";

export type { FiiDividendRow };

export interface DividendsResult {
  dividends: FiiDividendRow[];
  source?: "bolsai" | "statusinvest" | "brapi";
  dividendYieldTtm?: number;
  ttmPerShare?: number;
  note?: string;
}

function parseBrDate(value: string): string {
  const m = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return value;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function getBolsaiKey(): string | undefined {
  return process.env.BOLSAI_API_KEY?.trim() || undefined;
}

/** bolsai Free: /fiis/{ticker}/distributions — requer API key gratuita. */
async function fetchBolsaiDividends(ticker: string): Promise<DividendsResult | null> {
  const key = getBolsaiKey();
  if (!key) return null;

  const url = new URL(`https://api.usebolsai.com/api/v1/fiis/${encodeURIComponent(ticker)}/distributions`);
  url.searchParams.set("years", "2");

  const res = await fetch(url.toString(), {
    headers: { "X-API-Key": key },
    cache: "no-store",
  });

  if (!res.ok) return null;

  const json = (await res.json()) as {
    dividend_yield_ttm?: number;
    ttm_per_share?: number;
    payments?: Array<{
      reference_date?: string;
      value_per_share?: number;
      dy_month_pct?: number;
    }>;
  };

  const dividends: FiiDividendRow[] = (json.payments || [])
    .filter((p) => p.value_per_share != null && p.reference_date)
    .map((p) => ({
      label: "RENDIMENTO",
      rate: p.value_per_share as number,
      paymentDate: p.reference_date as string,
      relatedTo: p.reference_date?.slice(0, 7) ?? null,
    }));

  if (!dividends.length) return null;

  return {
    dividends,
    source: "bolsai",
    dividendYieldTtm: json.dividend_yield_ttm,
    ttmPerShare: json.ttm_per_share,
  };
}

/**
 * Status Invest — endpoint público usado pelo site (sem API key).
 * Não é oficial; pode mudar. Bom fallback gratuito para OSS.
 */
async function fetchStatusInvestDividends(ticker: string): Promise<DividendsResult | null> {
  const url =
    `https://statusinvest.com.br/fii/companytickerprovents` +
    `?ticker=${encodeURIComponent(ticker)}&chartProventsType=2`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "CarteiraLivre/0.1 (open-source; local-first portfolio)",
      Accept: "application/json, text/plain, */*",
      Referer: `https://statusinvest.com.br/fundos-imobiliarios/${ticker.toLowerCase()}`,
    },
    cache: "no-store",
  });

  if (!res.ok) return null;

  const json = (await res.json()) as {
    assetEarningsModels?: Array<{
      ed?: string;
      pd?: string;
      et?: string;
      etd?: string;
      v?: number;
    }>;
    helpers?: { earningsMainTextHelper?: string };
  };

  const rows = json.assetEarningsModels || [];
  const dividends: FiiDividendRow[] = rows
    .filter((r) => r.v != null && (r.pd || r.ed))
    .map((r) => ({
      label: (r.etd || r.et || "RENDIMENTO").toUpperCase(),
      rate: r.v as number,
      paymentDate: parseBrDate(r.pd || r.ed || ""),
      lastDatePrior: r.ed ? parseBrDate(r.ed) : undefined,
      relatedTo: r.ed ? parseBrDate(r.ed).slice(0, 7) : null,
    }))
    // últimos ~18 meses
    .filter((d) => {
      const t = Date.parse(d.paymentDate);
      if (!Number.isFinite(t)) return true;
      return t > Date.now() - 560 * 24 * 60 * 60 * 1000;
    });

  if (!dividends.length) return null;

  const ttm = dividends
    .filter((d) => Date.parse(d.paymentDate) > Date.now() - 365 * 24 * 60 * 60 * 1000)
    .reduce((s, d) => s + d.rate, 0);

  return {
    dividends,
    source: "statusinvest",
    ttmPerShare: ttm || undefined,
    note: "Proventos via Status Invest (fonte não oficial; pode mudar).",
  };
}

/** brapi Pro — só funciona com plano adequado / sandbox MXRF11|HGLG11. */
async function fetchBrapiFiiDividends(
  ticker: string,
  token: string | undefined
): Promise<DividendsResult | null> {
  if (!token) return null;

  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 18);
  const url = new URL("https://brapi.dev/api/v2/fii/dividends");
  url.searchParams.set("symbols", ticker);
  url.searchParams.set("startDate", start.toISOString().slice(0, 10));
  url.searchParams.set("endDate", end.toISOString().slice(0, 10));
  url.searchParams.set("sortOrder", "desc");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;

  const json = await res.json();
  const rows = (json.dividends || []) as Array<{
    label?: string;
    rate?: number;
    paymentDate?: string;
    lastDatePrior?: string;
    relatedTo?: string | null;
  }>;

  const dividends: FiiDividendRow[] = rows
    .filter((d) => d.rate != null && d.paymentDate)
    .map((d) => ({
      label: d.label || "RENDIMENTO",
      rate: d.rate as number,
      paymentDate: d.paymentDate as string,
      lastDatePrior: d.lastDatePrior,
      relatedTo: d.relatedTo,
    }));

  if (!dividends.length) return null;
  return { dividends, source: "brapi" };
}

/**
 * Cascata: bolsai (se tiver chave) → Status Invest (sem chave) → brapi Pro.
 */
export async function fetchFiiDividends(
  ticker: string,
  brapiToken?: string
): Promise<DividendsResult> {
  const bolsai = await fetchBolsaiDividends(ticker);
  if (bolsai) return bolsai;

  const status = await fetchStatusInvestDividends(ticker);
  if (status) return status;

  const brapi = await fetchBrapiFiiDividends(ticker, brapiToken);
  if (brapi) return brapi;

  return {
    dividends: [],
    note:
      "Não foi possível obter dividendos. Tente de novo mais tarde, ou configure BOLSAI_API_KEY (gratuita em usebolsai.com).",
  };
}
