import { NextRequest, NextResponse } from "next/server";
import { isValidB3Ticker } from "@/lib/brapi-server";
import { CHART_RANGES, DEFAULT_CHART_RANGE, type ChartRangeId } from "@/lib/chart-ranges";
import { buildFiiDetail } from "@/lib/fii-detail";

export type { PricePoint } from "@/lib/fii-detail";

function parseRange(raw: string | null): ChartRangeId {
  const id = (raw || "").trim() as ChartRangeId;
  if (CHART_RANGES.some((r) => r.id === id)) return id;
  return DEFAULT_CHART_RANGE;
}

export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get("ticker") || "").trim().toUpperCase();
  if (!isValidB3Ticker(ticker)) {
    return NextResponse.json({ error: "Ticker inválido" }, { status: 400 });
  }

  const range = parseRange(req.nextUrl.searchParams.get("range"));
  const payload = await buildFiiDetail(ticker, { includeHistory: true, range });
  return NextResponse.json(payload);
}
