export interface QuoteResult {
  ticker: string;
  price: number;
  changePercent?: number;
  shortName?: string;
  asOf?: string;
  error?: string;
}

export function getQuotesToken(): string | undefined {
  return process.env.BRAPI_TOKEN?.trim() || undefined;
}

export function isBrapiConfigured(): boolean {
  return Boolean(getQuotesToken());
}

export function normalizeQuoteSymbols(raw: unknown[], max = 80): string[] {
  return [
    ...new Set(
      raw
        .map((s) => String(s).trim().toUpperCase())
        .filter((s) => /^[A-Z]{4}\d{1,2}[A-Z]?$/.test(s))
    ),
  ].slice(0, max);
}

async function fetchOneQuote(ticker: string, token: string): Promise<QuoteResult> {
  const url = new URL("https://brapi.dev/api/v2/stocks/quote");
  url.searchParams.set("symbols", ticker);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
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
  if (!row || price == null || !Number.isFinite(price)) {
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

export async function fetchQuotesForSymbols(symbols: string[]): Promise<{
  configured: true;
  fetchedAt: string;
  quotes: QuoteResult[];
}> {
  const token = getQuotesToken();
  if (!token) {
    throw new Error("BRAPI_TOKEN não configurado");
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

  return {
    configured: true,
    fetchedAt: new Date().toISOString(),
    quotes,
  };
}
