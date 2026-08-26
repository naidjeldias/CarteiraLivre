import type { FiiTipo } from "./types";

export interface FiiFundamentals {
  ticker: string;
  name?: string;
  source: "bolsai";
  referenceDate?: string;
  closePrice?: number;
  bookValuePerShare?: number;
  pvp?: number;
  dividendYieldTtm?: number;
  netAssetValue?: number;
  totalShareholders?: number;
  segment?: string;
  fundType?: string;
  managementType?: string;
  administrator?: string;
  mandate?: string;
  vacancyPct?: number;
  delinquencyPct?: number;
  leasedPct?: number;
  propertyCount?: number;
  totalAreaSqm?: number;
  assetComposition?: {
    realEstateLeasedPct?: number;
    criPct?: number;
    fiiHoldingsPct?: number;
    cashPct?: number;
    stocksPct?: number;
    otherPct?: number;
  };
  topProperties?: Array<{
    name: string;
    address?: string;
    areaSqm?: number;
    revenuePct?: number;
    vacancyPct?: number;
  }>;
}

function mapFundType(raw?: string): FiiTipo | undefined {
  if (!raw) return undefined;
  const t = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (t.includes("tijolo")) return "tijolo";
  if (t.includes("papel")) return "papel";
  if (t.includes("fundo de fundo") || t.includes("fof")) return "fof";
  if (t.includes("hibrid")) return "hibrido";
  if (t.includes("desenvolv")) return "desenvolvimento";
  return undefined;
}

export function fundTypeFromBolsai(raw?: string): FiiTipo | undefined {
  return mapFundType(raw);
}

export function pickBolsaiCnpj(raw: Record<string, unknown> | null | undefined): string | undefined {
  if (!raw) return undefined;
  const keys = ["cnpj", "cnpj_fundo", "cnpjFundo", "fund_cnpj", "document", "cnpj_fundo_classe"];
  for (const key of keys) {
    const val = raw[key];
    if (typeof val === "string" && val.replace(/\D/g, "").length === 14) return val;
  }
  return undefined;
}

export async function fetchBolsaiCnpj(ticker: string): Promise<string | undefined> {
  const key = process.env.BOLSAI_API_KEY?.trim();
  if (!key) return undefined;
  try {
    const res = await fetch(`https://api.usebolsai.com/api/v1/fiis/${encodeURIComponent(ticker)}`, {
      headers: { "X-API-Key": key },
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const j = (await res.json()) as Record<string, unknown>;
    return pickBolsaiCnpj(j);
  } catch {
    return undefined;
  }
}

export async function fetchBolsaiFundamentals(
  ticker: string
): Promise<FiiFundamentals | null> {
  const key = process.env.BOLSAI_API_KEY?.trim();
  if (!key) return null;

  const res = await fetch(`https://api.usebolsai.com/api/v1/fiis/${encodeURIComponent(ticker)}`, {
    headers: { "X-API-Key": key },
    cache: "no-store",
  });
  if (!res.ok) return null;

  const j = await res.json();
  const ac = j.asset_composition || {};

  return {
    ticker: j.ticker || ticker,
    name: j.name,
    source: "bolsai",
    referenceDate: j.reference_date,
    closePrice: j.close_price,
    bookValuePerShare: j.book_value_per_share,
    pvp: j.pvp,
    dividendYieldTtm: j.dividend_yield_ttm,
    netAssetValue: j.net_asset_value,
    totalShareholders: j.total_shareholders,
    segment: j.segment,
    fundType: j.fund_type,
    managementType: j.management_type,
    administrator: j.administrator,
    mandate: j.mandate,
    vacancyPct: j.vacancy_pct,
    delinquencyPct: j.delinquency_pct,
    leasedPct: j.leased_pct,
    propertyCount: j.property_count,
    totalAreaSqm: j.total_area_sqm,
    assetComposition: {
      realEstateLeasedPct: ac.real_estate_leased_pct,
      criPct: ac.cri_pct,
      fiiHoldingsPct: ac.fii_holdings_pct,
      cashPct: ac.cash_pct,
      stocksPct: ac.stocks_pct,
      otherPct: ac.other_pct,
    },
    topProperties: Array.isArray(j.top_properties)
      ? j.top_properties.slice(0, 5).map(
          (p: {
            name?: string;
            address?: string;
            area_sqm?: number;
            revenue_pct?: number;
            vacancy_pct?: number;
          }) => ({
            name: p.name || "Imóvel",
            address: p.address,
            areaSqm: p.area_sqm,
            revenuePct: p.revenue_pct,
            vacancyPct: p.vacancy_pct,
          })
        )
      : undefined,
  };
}
