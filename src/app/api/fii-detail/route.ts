import { NextRequest, NextResponse } from "next/server";
import { isValidB3Ticker } from "@/lib/brapi-server";
import { buildFiiDetail } from "@/lib/fii-detail";

export type { PricePoint } from "@/lib/fii-detail";

export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get("ticker") || "").trim().toUpperCase();
  if (!isValidB3Ticker(ticker)) {
    return NextResponse.json({ error: "Ticker inválido" }, { status: 400 });
  }

  const payload = await buildFiiDetail(ticker, { includeHistory: true });
  return NextResponse.json(payload);
}
