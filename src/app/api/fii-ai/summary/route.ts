import { NextRequest, NextResponse } from "next/server";
import { isValidB3Ticker } from "@/lib/brapi-server";
import { getDefaultGeminiModel, isGeminiConfigured } from "@/lib/agent/gemini";
import { GEMINI_MODELS, isAllowedGeminiModel } from "@/lib/agent/models";
import { buildFiiCurrentSummary, geminiErrorMessage } from "@/lib/disclosures/summary";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({
    configured: isGeminiConfigured(),
    provider: "gemini",
    defaultModel: getDefaultGeminiModel(),
    models: GEMINI_MODELS,
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

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const rec = body as Record<string, unknown>;
  const ticker = String(rec.ticker || "")
    .trim()
    .toUpperCase();
  if (!isValidB3Ticker(ticker)) {
    return NextResponse.json({ error: "Ticker inválido." }, { status: 400 });
  }

  let model: string | undefined;
  if (rec.model != null && rec.model !== "") {
    if (typeof rec.model !== "string" || !isAllowedGeminiModel(rec.model)) {
      return NextResponse.json({ error: "Modelo inválido. Escolha um da lista." }, { status: 400 });
    }
    model = rec.model;
  }

  try {
    const result = await buildFiiCurrentSummary(ticker, { model });
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
