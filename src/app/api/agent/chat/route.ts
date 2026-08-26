import { NextRequest, NextResponse } from "next/server";
import { getDefaultGeminiModel, isGeminiConfigured } from "@/lib/agent/gemini";
import { GEMINI_MODELS } from "@/lib/agent/models";
import { agentSseHeaders, runAgentSse, validateAgentRequest } from "@/lib/agent/run-agent";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Status: chave configurada? (não expõe a chave) */
export async function GET() {
  return NextResponse.json({
    configured: isGeminiConfigured(),
    provider: "gemini",
    defaultModel: getDefaultGeminiModel(),
    models: GEMINI_MODELS,
  });
}

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(`agent-chat:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 20,
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

  const parsed = validateAgentRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const stream = runAgentSse(parsed.value);
  return new Response(stream, { headers: agentSseHeaders() });
}
