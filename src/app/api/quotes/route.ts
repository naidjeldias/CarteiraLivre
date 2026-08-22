import { NextRequest, NextResponse } from "next/server";
import {
  fetchQuotesForSymbols,
  getQuotesToken,
  isBrapiConfigured,
  normalizeQuoteSymbols,
} from "@/lib/quotes-server";

export type { QuoteResult } from "@/lib/quotes-server";

/** Status: token configurado? (não expõe o token) */
export async function GET() {
  return NextResponse.json({
    configured: isBrapiConfigured(),
    provider: "brapi",
    planHint: "Free: 1 ticker/request, ~15k req/mês. Cotações básicas.",
  });
}

/**
 * Body: { symbols: string[] }
 * Free plan: 1 símbolo por chamada à brapi — fazemos sequencial no server.
 */
export async function POST(req: NextRequest) {
  if (!getQuotesToken()) {
    return NextResponse.json(
      {
        error:
          "BRAPI_TOKEN não configurado. Crie .env.local com BRAPI_TOKEN=seu_token (dashboard brapi.dev).",
        configured: false,
      },
      { status: 503 }
    );
  }

  let body: { symbols?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const raw = Array.isArray(body.symbols) ? body.symbols : [];
  const symbols = normalizeQuoteSymbols(raw, 80);

  if (symbols.length === 0) {
    return NextResponse.json({ error: "Nenhum ticker válido", quotes: [] }, { status: 400 });
  }

  const result = await fetchQuotesForSymbols(symbols);
  return NextResponse.json(result);
}
