import {
  allocationByAssetClass,
  allocationByFiiSegmento,
  allocationByFiiTipo,
} from "@/lib/allocation";
import { isValidB3Ticker } from "@/lib/brapi-server";
import { lookupFii } from "@/lib/fii-catalog";
import { buildFiiDetail } from "@/lib/fii-detail";
import { fetchQuotesForSymbols, isBrapiConfigured, normalizeQuoteSymbols } from "@/lib/quotes-server";
import type { AssetClass } from "@/lib/types";
import {
  snapshotFromSummary,
  type PortfolioSummary,
  type SummaryPosition,
} from "./portfolio-summary";

const ASSET_CLASSES: AssetClass[] = [
  "acao",
  "fii",
  "etf",
  "bdr",
  "renda_fixa",
  "tesouro",
  "outro",
];

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  summary: PortfolioSummary
): Promise<unknown> {
  switch (name) {
    case "get_allocation":
      return handleAllocation(args, summary);
    case "get_positions":
      return handlePositions(args, summary);
    case "get_fii_meta":
      return handleFiiMeta(args);
    case "get_fii_detail":
      return handleFiiDetail(args);
    case "get_quotes":
      return handleQuotes(args, summary);
    default:
      return { error: `Ferramenta desconhecida: ${name}` };
  }
}

function handleAllocation(args: Record<string, unknown>, summary: PortfolioSummary) {
  const groupBy = asString(args.groupBy);
  const snapshot = snapshotFromSummary(summary);
  if (groupBy === "assetClass") {
    return { groupBy, slices: allocationByAssetClass(snapshot) };
  }
  if (groupBy === "fiiTipo") {
    return { groupBy, slices: allocationByFiiTipo(snapshot) };
  }
  if (groupBy === "fiiSegmento") {
    return { groupBy, slices: allocationByFiiSegmento(snapshot) };
  }
  return { error: "groupBy inválido. Use assetClass, fiiTipo ou fiiSegmento." };
}

function handlePositions(args: Record<string, unknown>, summary: PortfolioSummary) {
  const ticker = asString(args.ticker).toUpperCase();
  const assetClass = asString(args.assetClass) as AssetClass | "";
  const sortBy = asString(args.sortBy) === "ticker" ? "ticker" : "value";
  const order = asString(args.order) === "asc" ? "asc" : "desc";
  const limit = Math.min(30, Math.max(1, Math.round(asNumber(args.limit, 10))));

  if (assetClass && !ASSET_CLASSES.includes(assetClass)) {
    return { error: `assetClass inválido: ${assetClass}` };
  }

  let rows: SummaryPosition[] = summary.positions;
  if (assetClass) rows = rows.filter((p) => p.assetClass === assetClass);
  if (ticker) rows = rows.filter((p) => p.ticker.toUpperCase() === ticker);

  rows = [...rows].sort((a, b) => {
    if (sortBy === "ticker") {
      const cmp = a.ticker.localeCompare(b.ticker);
      return order === "asc" ? cmp : -cmp;
    }
    const cmp = a.value - b.value;
    return order === "asc" ? cmp : -cmp;
  });

  const sliced = rows.slice(0, limit);
  const top = sliced[0];
  return {
    count: sliced.length,
    totalMatched: rows.length,
    topWeight: top && summary.totalValue ? top.value / summary.totalValue : null,
    positions: sliced,
  };
}

function handleFiiMeta(args: Record<string, unknown>) {
  const ticker = asString(args.ticker).toUpperCase();
  if (!ticker) return { error: "Informe o ticker." };
  return lookupFii(ticker);
}

async function handleFiiDetail(args: Record<string, unknown>) {
  const ticker = asString(args.ticker).toUpperCase();
  if (!isValidB3Ticker(ticker)) {
    return { error: "Ticker inválido." };
  }
  const detail = await buildFiiDetail(ticker, { includeHistory: false });
  return {
    ticker: detail.ticker,
    quote: detail.quote,
    dividends: detail.dividends.slice(0, 18),
    dividendsNote: detail.dividendsNote,
    dividendsSource: detail.dividendsSource,
    dividendYieldTtm: detail.dividendYieldTtm,
    ttmPerShare: detail.ttmPerShare,
    fundamentals: detail.fundamentals,
    resolvedTipo: detail.resolvedTipo,
    priceSignal: detail.priceSignal,
    providers: detail.providers,
    fetchedAt: detail.fetchedAt,
  };
}

async function handleQuotes(args: Record<string, unknown>, summary: PortfolioSummary) {
  if (!isBrapiConfigured()) {
    return {
      error:
        "BRAPI_TOKEN não configurado. Sem cotações ao vivo. Use os preços do extrato no resumo da carteira.",
      configured: false,
    };
  }

  const raw = Array.isArray(args.tickers) ? args.tickers : [];
  const requested = normalizeQuoteSymbols(raw, 40);
  const inPortfolio = new Set(summary.positions.map((p) => p.ticker.toUpperCase()));

  let symbols = requested;
  if (symbols.length === 0) {
    symbols = normalizeQuoteSymbols(
      summary.positions.map((p) => p.ticker),
      15
    );
  } else {
    symbols = [
      ...symbols.filter((t) => inPortfolio.has(t)),
      ...symbols.filter((t) => !inPortfolio.has(t)),
    ].slice(0, 15);
  }

  if (symbols.length === 0) {
    return { error: "Nenhum ticker válido para cotação.", quotes: [] };
  }

  return fetchQuotesForSymbols(symbols);
}
