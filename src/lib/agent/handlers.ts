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
import { listDisclosures, readTickerIndex } from "@/lib/disclosures/store";
import { searchFiiDocuments } from "@/lib/rag/search";
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
    case "list_recent_disclosures":
      return handleRecentDisclosures(args, summary);
    case "search_fii_documents":
      return handleSearchDocuments(args);
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

function handleRecentDisclosures(args: Record<string, unknown>, summary: PortfolioSummary) {
  const days = Math.min(180, Math.max(7, Math.round(asNumber(args.days, 180))));
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const requested: string[] = [];
  const single = asString(args.ticker).toUpperCase();
  if (single) requested.push(single);
  if (Array.isArray(args.tickers)) {
    for (const t of args.tickers) {
      const v = asString(t).toUpperCase();
      if (v) requested.push(v);
    }
  }
  const unique = [...new Set(requested.filter((t) => isValidB3Ticker(t)))];
  const fromPortfolio = summary.positions
    .filter((p) => p.assetClass === "fii" && p.ticker.endsWith("11") && isValidB3Ticker(p.ticker))
    .map((p) => p.ticker.toUpperCase());
  const tickers = (unique.length ? unique : [...new Set(fromPortfolio)]).slice(0, 20);
  if (tickers.length === 0) {
    return { error: "Nenhum ticker de FII para consultar.", days, disclosures: [], unsynced: [] };
  }

  const disclosures: Array<{
    ticker: string;
    type: string;
    title: string;
    publishedAt: string;
    url: string;
  }> = [];
  const unsynced: string[] = [];

  for (const ticker of tickers) {
    const index = readTickerIndex(ticker);
    if (!index) {
      unsynced.push(ticker);
      continue;
    }
    const items = listDisclosures(ticker).filter((d) => d.publishedAt >= cutoff);
    if (items.length === 0) {
      disclosures.push({
        ticker,
        type: "outro",
        title: "Cache local sem comunicados neste período",
        publishedAt: index.syncedAt.slice(0, 10),
        url: "",
      });
      continue;
    }
    for (const item of items.slice(0, 12)) {
      disclosures.push({
        ticker,
        type: item.type,
        title: item.title,
        publishedAt: item.publishedAt,
        url: item.url,
      });
    }
  }

  disclosures.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return {
    days,
    tickers,
    count: disclosures.length,
    disclosures: disclosures.slice(0, 40),
    unsynced,
    note:
      unsynced.length > 0
        ? "Alguns FIIs ainda não têm cache local. Peça para abrir a página do FII no app para sincronizar."
        : undefined,
  };
}

async function handleSearchDocuments(args: Record<string, unknown>) {
  const ticker = asString(args.ticker).toUpperCase();
  const query = asString(args.query);
  const topK = Math.min(8, Math.max(1, Math.round(asNumber(args.topK, 5))));
  if (!isValidB3Ticker(ticker)) return { error: "Ticker inválido." };
  if (!query) return { error: "Informe a consulta." };
  const index = readTickerIndex(ticker);
  if (!index) {
    return {
      error: `Não há documentos em cache para ${ticker}. Abra /fii/${ticker} para sincronizar e tente de novo.`,
      hits: [],
    };
  }
  const hits = await searchFiiDocuments(ticker, query, topK);
  return {
    ticker,
    query,
    hits: hits.map((h) => ({
      title: h.title,
      publishedAt: h.publishedAt,
      url: h.url,
      text: h.text,
      score: Number(h.score.toFixed(3)),
    })),
    note:
      hits.length === 0
        ? "Nenhum trecho encontrado no cache. O PDF pode não ter sido extraído; use o título/URL da lista de comunicados."
        : undefined,
  };
}
