import { NextRequest, NextResponse } from "next/server";
import { getChatSession, setChatSession } from "@/lib/agent/chat-session-store";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Current in-memory assistant session (cleared when the process stops). */
export async function GET() {
  return NextResponse.json(getChatSession());
}

export async function PUT(req: NextRequest) {
  const limited = checkRateLimit(`agent-session:${clientIp(req)}`, {
    windowMs: 60_000,
    max: 120,
  });
  if (!limited.ok) {
    return rateLimitResponse(limited.retryAfterSec);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const result = setChatSession(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result.session);
}
