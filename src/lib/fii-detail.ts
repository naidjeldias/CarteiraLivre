import { brapiHeaders, getBrapiToken } from "@/lib/brapi-server";
import { fetchFiiDividends } from "@/lib/dividends-providers";
import { fetchBolsaiFundamentals, fundTypeFromBolsai } from "@/lib/fii-fundamentals";
import { lookupFii } from "@/lib/fii-catalog";
import { computePriceSignal, type PriceSignal } from "@/lib/fii-score";
import type { FiiFundamentals } from "@/lib/fii-fundamentals";
import type { FiiDividendRow } from "@/lib/dividends-types";
import type { FiiTipo } from "@/lib/types";

export interface PricePoint {
  date: string;
  close: number;
  volume?: number;
}

export interface FiiQuoteInfo {
  price: number;
  changePercent?: number;
  shortName?: string;
  longName?: string;
  asOf?: string;
  previousClose?: number;
  dayHigh?: number;
  dayLow?: number;
}

export interface FiiDetailPayload {
  ticker: string;
  quote: FiiQuoteInfo | null;
  history?: PricePoint[];
  dividends: FiiDividendRow[];
  dividendsNote?: string;
  dividendsSource: string | null;
  dividendYieldTtm: number | null;
  ttmPerShare: number | null;
  fundamentals: FiiFundamentals | null;
  resolvedTipo: FiiTipo;
  priceSignal: PriceSignal;
  providers: {
    brapiConfigured: boolean;
    bolsaiConfigured: boolean;
  };
  fetchedAt: string;
}

async function fetchQuote(ticker: string, token: string): Promise<FiiQuoteInfo | null> {
  const url = new URL("https://brapi.dev/api/v2/stocks/quote");
  url.searchParams.set("symbols", ticker);
  const res = await fetch(url.toString(), {
    headers: brapiHeaders(token),
    cache: "no-store",
  });

  if (res.ok) {
    const json = await res.json();
    const row = json.results?.[0];
    const data = row?.data;
    if (data?.regularMarketPrice != null) {
      return {
        price: data.regularMarketPrice as number,
        changePercent: data.regularMarketChangePercent as number | undefined,
        shortName: data.shortName as string | undefined,
        longName: data.longName as string | undefined,
        asOf: data.regularMarketTime as string | undefined,
        previousClose: data.regularMarketPreviousClose as number | undefined,
        dayHigh: data.regularMarketDayHigh as number | undefined,
        dayLow: data.regularMarketDayLow as number | undefined,
      };
    }
  }

  const legacy = await fetch(
    `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?token=${encodeURIComponent(token)}`,
    { cache: "no-store" }
  );
  if (!legacy.ok) return null;
  const lj = await legacy.json();
  const r = lj.results?.[0];
  if (!r?.regularMarketPrice) return null;
  return {
    price: r.regularMarketPrice as number,
    changePercent: r.regularMarketChangePercent as number | undefined,
    shortName: r.shortName as string | undefined,
    longName: r.longName as string | undefined,
    asOf:
      typeof r.regularMarketTime === "number"
        ? new Date(r.regularMarketTime * 1000).toISOString()
        : (r.regularMarketTime as string | undefined),
    previousClose: r.regularMarketPreviousClose as number | undefined,
    dayHigh: r.regularMarketDayHigh as number | undefined,
    dayLow: r.regularMarketDayLow as number | undefined,
  };
}

async function fetchHistory(ticker: string, token: string): Promise<PricePoint[]> {
  const url = new URL("https://brapi.dev/api/v2/stocks/historical");
  url.searchParams.set("symbols", ticker);
  url.searchParams.set("range", "3mo");
  url.searchParams.set("interval", "1d");

  const res = await fetch(url.toString(), {
    headers: brapiHeaders(token),
    cache: "no-store",
  });

  if (res.ok) {
    const json = await res.json();
    const series = json.results?.[0]?.data?.historicalDataPrice as
      | Array<{ date: number; close: number | null; volume?: number | null }>
      | undefined;
    if (series?.length) {
      return series
        .filter((p) => p.close != null)
        .map((p) => ({
          date: new Date(p.date * 1000).toISOString().slice(0, 10),
          close: p.close as number,
          volume: p.volume ?? undefined,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }
  }

  const legacyUrl = `https://brapi.dev/api/quote/${encodeURIComponent(
    ticker
  )}?range=3mo&interval=1d&token=${encodeURIComponent(token)}`;
  const legacy = await fetch(legacyUrl, { cache: "no-store" });
  if (!legacy.ok) return [];
  const lj = await legacy.json();
  const series = lj.results?.[0]?.historicalDataPrice as
    | Array<{ date: number; close: number; volume?: number }>
    | undefined;
  if (!series?.length) return [];
  return series
    .map((p) => ({
      date: new Date(p.date * 1000).toISOString().slice(0, 10),
      close: p.close,
      volume: p.volume,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function monthlyDividendSeries(dividends: Array<{ paymentDate: string; rate: number }>): number[] {
  const map = new Map<string, number>();
  for (const d of dividends) {
    const key = d.paymentDate.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    map.set(key, (map.get(key) ?? 0) + d.rate);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => v);
}

export async function buildFiiDetail(
  ticker: string,
  options?: { includeHistory?: boolean }
): Promise<FiiDetailPayload> {
  const includeHistory = options?.includeHistory !== false;
  const token = getBrapiToken();
  const catalog = lookupFii(ticker);

  const [quote, history, divResult, fundamentals] = await Promise.all([
    token ? fetchQuote(ticker, token) : Promise.resolve(null),
    token && includeHistory ? fetchHistory(ticker, token) : Promise.resolve([] as PricePoint[]),
    fetchFiiDividends(ticker, token),
    fetchBolsaiFundamentals(ticker),
  ]);

  const price = quote?.price ?? fundamentals?.closePrice ?? null;
  const ttmFromDivs = (() => {
    const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
    return divResult.dividends
      .filter((d) => Date.parse(d.paymentDate) >= cutoff)
      .reduce((s, d) => s + d.rate, 0);
  })();

  const dyTtm =
    fundamentals?.dividendYieldTtm ??
    divResult.dividendYieldTtm ??
    (price && ttmFromDivs > 0 ? (ttmFromDivs / price) * 100 : null);

  const tipo =
    fundTypeFromBolsai(fundamentals?.fundType) ||
    (catalog.tipo !== "desconhecido" ? catalog.tipo : "desconhecido");

  const priceSignal = computePriceSignal({
    tipo,
    pvp: fundamentals?.pvp,
    dividendYieldTtm: dyTtm,
    monthlyDividends: monthlyDividendSeries(divResult.dividends),
    vacancyPct: fundamentals?.vacancyPct,
    delinquencyPct: fundamentals?.delinquencyPct,
    fiiHoldingsPct: fundamentals?.assetComposition?.fiiHoldingsPct,
    criPct: fundamentals?.assetComposition?.criPct,
  });

  const payload: FiiDetailPayload = {
    ticker,
    quote,
    dividends: divResult.dividends,
    dividendsNote: divResult.note,
    dividendsSource: divResult.source ?? null,
    dividendYieldTtm: dyTtm,
    ttmPerShare: divResult.ttmPerShare ?? (ttmFromDivs || null),
    fundamentals,
    resolvedTipo: tipo,
    priceSignal,
    providers: {
      brapiConfigured: Boolean(token),
      bolsaiConfigured: Boolean(process.env.BOLSAI_API_KEY?.trim()),
    },
    fetchedAt: new Date().toISOString(),
  };

  if (includeHistory) payload.history = history;
  return payload;
}
