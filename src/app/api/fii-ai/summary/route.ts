import { NextRequest, NextResponse } from "next/server";
import { isValidB3Ticker } from "@/lib/brapi-server";
import { isGeminiConfigured } from "@/lib/agent/gemini";
import { buildFiiCurrentSummary, geminiErrorMessage } from "@/lib/disclosures/summary";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({
    configured: isGeminiConfigured(),
    provider: "gemini",
  });
}

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(`fii-ai-summary:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 10,
  });
  if (!limited.ok) {
    return rateLimitResponse(limited.retryAfterSec);
  }

  if (!isGeminiConfigured()) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY não configurado. Crie .env.local com GEMINI_API_KEY=sua_chave (https://aistudio.google.com/apikey) e recrie o container (docker compose up -d --force-recreate).",
        configured: false,
      },
      { status: 503 }
    );
  }

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
  if (!isValidB3Ticker(ticker)) {
    return NextResponse.json({ error: "Ticker inválido." }, { status: 400 });
  }

  try {
    const result = await buildFiiCurrentSummary(ticker);
    return NextResponse.json({
      ticker,
      markdown: result.markdown,
      cached: result.cached,
      configured: true,
    });
  } catch (e) {
    return NextResponse.json({ error: geminiErrorMessage(e), configured: true }, { status: 502 });
  }
}
