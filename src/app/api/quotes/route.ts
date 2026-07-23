import { NextRequest, NextResponse } from "next/server";

export interface QuoteResult {
  ticker: string;
  price: number;
  changePercent?: number;
  shortName?: string;
  asOf?: string;
  error?: string;
}

function getToken(): string | undefined {
  return process.env.BRAPI_TOKEN?.trim() || undefined;
}

async function fetchOneQuote(ticker: string, token: string): Promise<QuoteResult> {
  const url = new URL("https://brapi.dev/api/v2/stocks/quote");
  url.searchParams.set("symbols", ticker);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    // Free plan: avoid Next aggressive caching of market data
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    return { ticker, price: 0, error: "Token brapi inválido ou sem permissão." };
  }
  if (res.status === 429) {
    return { ticker, price: 0, error: "Limite de requisições da brapi atingido." };
  }
  if (!res.ok) {
    return { ticker, price: 0, error: `HTTP ${res.status}` };
  }

  const json = (await res.json()) as {
    results?: Array<{
      requestedSymbol?: string;
      symbol?: string;
      data?: {
        regularMarketPrice?: number;
        regularMarketChangePercent?: number;
        shortName?: string;
        regularMarketTime?: string;
      };
    }>;
    message?: string;
    error?: boolean;
  };

  if (json.error || !json.results?.length) {
    // Fallback legado Free: /api/quote/TICKER
    return fetchLegacyQuote(ticker, token);
  }

  const row = json.results[0];
  const price = row.data?.regularMarketPrice;
  if (price == null || !Number.isFinite(price)) {
    return { ticker, price: 0, error: "Cotação indisponível" };
  }

  return {
    ticker: row.symbol || ticker,
    price,
    changePercent: row.data?.regularMarketChangePercent,
    shortName: row.data?.shortName,
    asOf: row.data?.regularMarketTime,
  };
}

async function fetchLegacyQuote(ticker: string, token: string): Promise<QuoteResult> {
  const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return { ticker, price: 0, error: `Sem cotação (${res.status})` };
  }
  const json = (await res.json()) as {
    results?: Array<{
      symbol?: string;
      regularMarketPrice?: number;
      regularMarketChangePercent?: number;
      shortName?: string;
      regularMarketTime?: string | number;
    }>;
  };
  const row = json.results?.[0];
  const price = row?.regularMarketPrice;
  if (price == null || !Number.isFinite(price)) {
    return { ticker, price: 0, error: "Cotação indisponível" };
  }
  const asOf =
    typeof row.regularMarketTime === "number"
      ? new Date(row.regularMarketTime * 1000).toISOString()
      : row.regularMarketTime;

  return {
    ticker: row.symbol || ticker,
    price,
    changePercent: row.regularMarketChangePercent,
    shortName: row.shortName,
    asOf,
  };
}

/** Status: token configurado? (não expõe o token) */
export async function GET() {
  return NextResponse.json({
    configured: Boolean(getToken()),
    provider: "brapi",
    planHint: "Free: 1 ticker/request, ~15k req/mês. Cotações básicas.",
  });
}

/**
 * Body: { symbols: string[] }
 * Free plan: 1 símbolo por chamada à brapi — fazemos sequencial no server.
 */
export async function POST(req: NextRequest) {
  const token = getToken();
  if (!token) {
    return NextResponse.json(
      {
        error:
          "BRAPI_TOKEN não configurado. Crie .env.local com BRAPI_TOKEN=seu_token (dashboard brapi.dev).",
        configured: false,
      },
      { status: 503 }
    );
  }

  let body: { symbols?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const raw = Array.isArray(body.symbols) ? body.symbols : [];
  const symbols = [
    ...new Set(
      raw
        .map((s) => String(s).trim().toUpperCase())
        .filter((s) => /^[A-Z]{4}\d{1,2}[A-Z]?$/.test(s))
    ),
  ].slice(0, 80);

  if (symbols.length === 0) {
    return NextResponse.json({ error: "Nenhum ticker válido", quotes: [] }, { status: 400 });
  }

  const quotes: QuoteResult[] = [];
  for (const symbol of symbols) {
    try {
      quotes.push(await fetchOneQuote(symbol, token));
    } catch (e) {
      quotes.push({
        ticker: symbol,
        price: 0,
        error: e instanceof Error ? e.message : "Falha na cotação",
      });
    }
  }

  return NextResponse.json({
    configured: true,
    fetchedAt: new Date().toISOString(),
    quotes,
  });
}
