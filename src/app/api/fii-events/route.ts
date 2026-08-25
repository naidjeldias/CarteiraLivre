import { NextRequest, NextResponse } from "next/server";
import { isValidB3Ticker } from "@/lib/brapi-server";
import { isIndexStale, listDisclosures, readTickerIndex } from "@/lib/disclosures/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get("ticker") || "").trim().toUpperCase();
  if (!isValidB3Ticker(ticker)) {
    return NextResponse.json({ error: "Ticker inválido." }, { status: 400 });
  }

  const index = readTickerIndex(ticker);
  return NextResponse.json({
    ticker,
    disclosures: index ? listDisclosures(ticker) : [],
    syncedAt: index?.syncedAt ?? null,
    stale: isIndexStale(index),
    syncError: index?.syncError ?? null,
  });
}
