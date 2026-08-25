import { NextRequest, NextResponse } from "next/server";
import { isValidB3Ticker } from "@/lib/brapi-server";
import { syncTicker } from "@/lib/disclosures/sync";
import { isIndexStale, listDisclosures, readTickerIndex } from "@/lib/disclosures/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const ticker =
    typeof body === "object" && body && "ticker" in body
      ? String((body as { ticker?: unknown }).ticker || "")
          .trim()
          .toUpperCase()
      : "";
  const force =
    typeof body === "object" && body !== null && (body as { force?: unknown }).force === true;
  if (!isValidB3Ticker(ticker)) {
    return NextResponse.json({ error: "Ticker inválido." }, { status: 400 });
  }

  try {
    const result = await syncTicker(ticker, { force });
    return NextResponse.json({
      ticker: result.ticker,
      disclosures: result.disclosures,
      syncedAt: result.syncedAt,
      stale: isIndexStale(readTickerIndex(ticker)),
      syncError: result.syncError ?? null,
      skipped: Boolean(result.skipped),
    });
  } catch (e) {
    const index = readTickerIndex(ticker);
    return NextResponse.json(
      {
        ticker,
        disclosures: index ? listDisclosures(ticker) : [],
        syncedAt: index?.syncedAt ?? null,
        stale: true,
        syncError: e instanceof Error ? e.message : "Falha ao sincronizar documentos.",
      },
      { status: 502 }
    );
  }
}
