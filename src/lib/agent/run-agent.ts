import type { Content, GenerateContentResponse, Part } from "@google/genai";
import { FunctionCallingConfigMode } from "@google/genai";
import { MAX_SUMMARY_POSITIONS, type PortfolioSummary } from "./portfolio-summary";
import { createGeminiClient, geminiErrorMessage, resolveGeminiModel } from "./gemini";
import { executeTool } from "./handlers";
import { isAllowedGeminiModel } from "./models";
import { SYSTEM_PROMPT } from "./system-prompt";
import { AGENT_TOOLS, TOOL_STATUS } from "./tools";

export const MAX_MESSAGES = 20;
export const MAX_CONTENT_CHARS = 4000;
export const MAX_TOOL_ITERS = 5;

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface AgentRequest {
  messages: ChatMessage[];
  portfolio: PortfolioSummary;
  model: string;
}

export type SseEvent =
  | { type: "status"; message: string }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type ValidateResult =
  | { ok: true; value: AgentRequest }
  | { ok: false; status: number; error: string };

const ASSET_CLASSES = new Set([
  "acao",
  "fii",
  "etf",
  "bdr",
  "renda_fixa",
  "tesouro",
  "outro",
]);

export function validateAgentRequest(body: unknown): ValidateResult {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, error: "JSON inválido." };
  }
  const rec = body as Record<string, unknown>;

  if (!Array.isArray(rec.messages)) {
    return { ok: false, status: 400, error: "Campo messages é obrigatório." };
  }
  if (rec.messages.length === 0) {
    return { ok: false, status: 400, error: "Envie ao menos uma mensagem." };
  }
  if (rec.messages.length > MAX_MESSAGES) {
    return {
      ok: false,
      status: 400,
      error: `No máximo ${MAX_MESSAGES} mensagens por requisição.`,
    };
  }

  const messages: ChatMessage[] = [];
  for (const item of rec.messages) {
    if (!item || typeof item !== "object") {
      return { ok: false, status: 400, error: "Mensagem inválida." };
    }
    const m = item as Record<string, unknown>;
    if (m.role !== "user" && m.role !== "assistant") {
      return { ok: false, status: 400, error: "Papel da mensagem deve ser user ou assistant." };
    }
    if (typeof m.content !== "string") {
      return { ok: false, status: 400, error: "Conteúdo da mensagem deve ser texto." };
    }
    if (m.content.length > MAX_CONTENT_CHARS) {
      return {
        ok: false,
        status: 400,
        error: `Mensagem excede ${MAX_CONTENT_CHARS} caracteres.`,
      };
    }
    messages.push({ role: m.role, content: m.content });
  }

  if (messages[messages.length - 1]?.role !== "user") {
    return { ok: false, status: 400, error: "A última mensagem precisa ser do usuário." };
  }

  const portfolio = parseSummary(rec.portfolio);
  if ("error" in portfolio) {
    return { ok: false, status: 400, error: portfolio.error };
  }

  let model = resolveGeminiModel();
  if (rec.model != null && rec.model !== "") {
    if (typeof rec.model !== "string" || !isAllowedGeminiModel(rec.model)) {
      return { ok: false, status: 400, error: "Modelo inválido. Escolha um da lista." };
    }
    model = rec.model;
  }

  return { ok: true, value: { messages, portfolio, model } };
}

function parseSummary(raw: unknown): PortfolioSummary | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "Campo portfolio (resumo) é obrigatório." };
  }
  const p = raw as Record<string, unknown>;
  if (typeof p.importedAt !== "string" || typeof p.sourceFileName !== "string") {
    return { error: "Resumo da carteira incompleto (importedAt / sourceFileName)." };
  }
  if (typeof p.positionCount !== "number" || typeof p.totalValue !== "number") {
    return { error: "Resumo da carteira incompleto (positionCount / totalValue)." };
  }
  if (!Array.isArray(p.positions)) {
    return { error: "Resumo da carteira sem posições." };
  }
  if (p.positions.length > MAX_SUMMARY_POSITIONS) {
    return { error: `No máximo ${MAX_SUMMARY_POSITIONS} posições no resumo.` };
  }

  const positions: PortfolioSummary["positions"] = [];
  for (const row of p.positions) {
    if (!row || typeof row !== "object") {
      return { error: "Posição inválida no resumo." };
    }
    const r = row as Record<string, unknown>;
    if (typeof r.ticker !== "string" || !r.ticker.trim()) {
      return { error: "Posição sem ticker." };
    }
    if (typeof r.quantity !== "number" || typeof r.price !== "number" || typeof r.value !== "number") {
      return { error: `Posição ${r.ticker} com números inválidos.` };
    }
    if (typeof r.assetClass !== "string" || !ASSET_CLASSES.has(r.assetClass)) {
      return { error: `Classe de ativo inválida em ${r.ticker}.` };
    }
    positions.push({
      ticker: r.ticker.trim().toUpperCase(),
      name: typeof r.name === "string" ? r.name : undefined,
      quantity: r.quantity,
      price: r.price,
      value: r.value,
      assetClass: r.assetClass as PortfolioSummary["positions"][number]["assetClass"],
      tipo: typeof r.tipo === "string" ? (r.tipo as PortfolioSummary["positions"][number]["tipo"]) : undefined,
      segmento:
        typeof r.segmento === "string"
          ? (r.segmento as PortfolioSummary["positions"][number]["segmento"])
          : undefined,
    });
  }

  const slices = (value: unknown): PortfolioSummary["allocationByAssetClass"] => {
    if (!Array.isArray(value)) return [];
    return value
      .filter((s) => s && typeof s === "object")
      .map((s) => {
        const x = s as Record<string, unknown>;
        return {
          key: String(x.key ?? ""),
          value: typeof x.value === "number" ? x.value : 0,
          weight: typeof x.weight === "number" ? x.weight : 0,
        };
      })
      .filter((s) => s.key);
  };

  return {
    importedAt: p.importedAt,
    sourceFileName: p.sourceFileName,
    positionCount: p.positionCount,
    totalValue: p.totalValue,
    positions,
    allocationByAssetClass: slices(p.allocationByAssetClass),
    allocationByFiiTipo: slices(p.allocationByFiiTipo),
  };
}

function encodeSse(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function extractFunctionCalls(response: GenerateContentResponse): Array<{
  name: string;
  args: Record<string, unknown>;
  id?: string;
}> {
  const fromHelper = response.functionCalls ?? [];
  if (fromHelper.length) {
    return fromHelper
      .filter((fc) => fc.name)
      .map((fc) => ({
        name: fc.name as string,
        args: (fc.args ?? {}) as Record<string, unknown>,
        id: fc.id,
      }));
  }
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part): part is Part & { functionCall: NonNullable<Part["functionCall"]> } =>
      Boolean(part.functionCall?.name)
    )
    .map((part) => ({
      name: part.functionCall.name as string,
      args: (part.functionCall.args ?? {}) as Record<string, unknown>,
      id: part.functionCall.id,
    }));
}

function toGeminiContents(messages: ChatMessage[]): Content[] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

export function agentSseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

export function runAgentSse(req: AgentRequest): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (event: SseEvent) => {
        controller.enqueue(encoder.encode(encodeSse(event)));
      };
      try {
        await runAgentLoop(req, send);
        send({ type: "done" });
      } catch (err) {
        send({ type: "error", message: geminiErrorMessage(err) });
      } finally {
        controller.close();
      }
    },
  });
}

async function runAgentLoop(req: AgentRequest, send: (event: SseEvent) => void) {
  const ai = createGeminiClient();
  const model = req.model;
  const systemInstruction = `${SYSTEM_PROMPT}\n\nResumo da carteira (JSON):\n${JSON.stringify(req.portfolio)}`;
  const contents: Content[] = toGeminiContents(req.messages);

  const baseConfig = {
    systemInstruction,
    tools: [{ functionDeclarations: AGENT_TOOLS }],
    toolConfig: {
      functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
    },
    automaticFunctionCalling: { disable: true },
  };

  for (let i = 0; i < MAX_TOOL_ITERS; i++) {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: baseConfig,
    });

    const calls = extractFunctionCalls(response);
    if (calls.length > 0) {
      const labels = [...new Set(calls.map((c) => TOOL_STATUS[c.name] || `Usando ${c.name}…`))];
      for (const message of labels) send({ type: "status", message });

      const modelContent = response.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent);

      const responseParts: Part[] = [];
      for (const call of calls) {
        const result = await executeTool(call.name, call.args, req.portfolio);
        responseParts.push({
          functionResponse: {
            name: call.name,
            id: call.id,
            response: (result && typeof result === "object"
              ? result
              : { result }) as Record<string, unknown>,
          },
        });
      }
      contents.push({ role: "user", parts: responseParts });
      continue;
    }

    const text = response.text?.trim();
    if (text) {
      send({ type: "delta", text });
      return;
    }
  }

  send({ type: "status", message: "Redigindo resposta…" });
  const finalStream = await ai.models.generateContentStream({
    model,
    contents,
    config: {
      systemInstruction,
      toolConfig: {
        functionCallingConfig: { mode: FunctionCallingConfigMode.NONE },
      },
      automaticFunctionCalling: { disable: true },
    },
  });

  let emitted = false;
  for await (const chunk of finalStream) {
    const piece = chunk.text;
    if (piece) {
      emitted = true;
      send({ type: "delta", text: piece });
    }
  }
  if (!emitted) {
    send({
      type: "error",
      message: "O modelo não devolveu texto. Tente perguntar de outro jeito.",
    });
  }
}
