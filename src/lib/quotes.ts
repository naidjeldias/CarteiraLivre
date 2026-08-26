import type { AssetClass, Position } from "./types";

export interface MarketQuote {
  ticker: string;
  price: number;
  changePercent?: number;
  shortName?: string;
  asOf?: string;
  error?: string;
}

export type QuotesMap = Record<string, MarketQuote>;

const CACHE_KEY = "carteiralivre.quotes.v1";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — alinhado ao delay do Free

interface QuotesCache {
  fetchedAt: string;
  quotes: QuotesMap;
}

const QUOTEABLE: AssetClass[] = ["acao", "fii", "etf", "bdr"];

export function isQuoteableTicker(ticker: string, assetClass: AssetClass): boolean {
  if (!QUOTEABLE.includes(assetClass)) return false;
  // FIIs e recibos: só cotas *11 (recibos *12–*18 costumam falhar na brapi)
  if (assetClass === "fii" || /^[A-Z]{4}1[2-8]$/.test(ticker)) {
    return /^[A-Z]{4}11$/.test(ticker);
  }
  // Ações, ETFs, BDRs: XXXX3/4 ou XXXX11 (ETF) etc.
  return /^[A-Z]{4}\d{1,2}[A-Z]?$/.test(ticker);
}

export function quoteableTickers(positions: Position[]): string[] {
  return [
    ...new Set(
      positions
        .filter((p) => isQuoteableTicker(p.ticker, p.assetClass))
        .map((p) => p.ticker)
    ),
  ];
}

export function loadQuotesCache(): QuotesCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuotesCache;
    if (!parsed.fetchedAt || !parsed.quotes) return null;
    const age = Date.now() - new Date(parsed.fetchedAt).getTime();
    if (age > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveQuotesCache(quotes: QuotesMap, fetchedAt: string) {
  if (typeof window === "undefined") return;
  const payload: QuotesCache = { fetchedAt, quotes };
  localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}

export async function fetchQuotesStatus(): Promise<{ configured: boolean }> {
  const res = await fetch("/api/quotes");
  return res.json();
}

export async function fetchMarketQuotes(symbols: string[]): Promise<{
  quotes: QuotesMap;
  fetchedAt: string;
}> {
  const res = await fetch("/api/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Falha ao buscar cotações (${res.status})`);
  }

  const map: QuotesMap = {};
  for (const q of data.quotes as MarketQuote[]) {
    map[q.ticker] = q;
    // Também indexa pelo símbolo pedido se a API normalizou
  }
  // Garante chave pelo símbolo solicitado
  for (const s of symbols) {
    if (!map[s]) {
      const found = (data.quotes as MarketQuote[]).find(
        (q) => q.ticker === s || q.ticker.startsWith(s.slice(0, 4))
      );
      if (found && !found.error) map[s] = { ...found, ticker: s };
      else if (found) map[s] = found;
    }
  }

  const fetchedAt = data.fetchedAt || new Date().toISOString();
  saveQuotesCache(map, fetchedAt);
  return { quotes: map, fetchedAt };
}

export function marketValue(position: Position, quotes: QuotesMap | null): number {
  const q = quotes?.[position.ticker];
  if (q && !q.error && q.price > 0) return position.quantity * q.price;
  return position.value;
}

export function totalMarketValue(positions: Position[], quotes: QuotesMap | null): number {
  return positions.reduce((sum, p) => sum + marketValue(p, quotes), 0);
}

export function formatSignedPct(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function vsExtractPct(extractPrice: number, marketPrice: number): number | null {
  if (!extractPrice || !marketPrice) return null;
  return ((marketPrice - extractPrice) / extractPrice) * 100;
}
