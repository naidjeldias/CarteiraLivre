import { NextRequest, NextResponse } from "next/server";
import { isValidB3Ticker } from "@/lib/brapi-server";
import { CHART_RANGES, type ChartRangeId } from "@/lib/chart-ranges";
import { fetchFiiHistory } from "@/lib/fii-detail";

function parseRange(raw: string | null): ChartRangeId {
  const id = (raw || "").trim() as ChartRangeId;
  if (CHART_RANGES.some((r) => r.id === id)) return id;
  return "5d";
}

export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get("ticker") || "").trim().toUpperCase();
  if (!isValidB3Ticker(ticker)) {
    return NextResponse.json({ error: "Ticker inválido" }, { status: 400 });
  }

  const range = parseRange(req.nextUrl.searchParams.get("range"));
  const history = await fetchFiiHistory(ticker, range);
  return NextResponse.json({ ticker, range, history, fetchedAt: new Date().toISOString() });
}
