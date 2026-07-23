import { NextRequest, NextResponse } from "next/server";
import { brapiHeaders, getBrapiToken, isValidB3Ticker } from "@/lib/brapi-server";
import { fetchFiiDividends } from "@/lib/dividends-providers";

export interface PricePoint {
  date: string;
  close: number;
  volume?: number;
}

async function fetchQuote(ticker: string, token: string) {
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

export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get("ticker") || "").trim().toUpperCase();
  if (!isValidB3Ticker(ticker)) {
    return NextResponse.json({ error: "Ticker inválido" }, { status: 400 });
  }

  const token = getBrapiToken();

  const [quote, history, divResult] = await Promise.all([
    token ? fetchQuote(ticker, token) : Promise.resolve(null),
    token ? fetchHistory(ticker, token) : Promise.resolve([] as PricePoint[]),
    fetchFiiDividends(ticker, token),
  ]);

  return NextResponse.json({
    ticker,
    quote,
    history,
    dividends: divResult.dividends,
    dividendsNote: divResult.note,
    dividendsSource: divResult.source ?? null,
    dividendYieldTtm: divResult.dividendYieldTtm ?? null,
    ttmPerShare: divResult.ttmPerShare ?? null,
    providers: {
      brapiConfigured: Boolean(token),
      bolsaiConfigured: Boolean(process.env.BOLSAI_API_KEY?.trim()),
    },
    fetchedAt: new Date().toISOString(),
  });
}
