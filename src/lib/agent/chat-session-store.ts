import { DEFAULT_GEMINI_MODEL, isAllowedGeminiModel } from "./models";
import {
  MAX_CONTENT_CHARS,
  MAX_MESSAGES,
  type ChatMessage,
  type ChatRole,
} from "./run-agent";

/** Assistant replies can exceed the per-request user cap; still bound storage size. */
const MAX_STORED_CONTENT_CHARS = Math.max(MAX_CONTENT_CHARS, 32_000);

export interface ChatSession {
  messages: ChatMessage[];
  open: boolean;
  model: string;
}

const DEFAULT_SESSION: ChatSession = {
  messages: [],
  open: true,
  model: DEFAULT_GEMINI_MODEL,
};

/** Process-local only — cleared when the Node process / container stops. */
let session: ChatSession = { ...DEFAULT_SESSION, messages: [] };

export function getChatSession(): ChatSession {
  return {
    messages: session.messages.map((m) => ({ ...m })),
    open: session.open,
    model: session.model,
  };
}

export type SetChatSessionResult =
  | { ok: true; session: ChatSession }
  | { ok: false; error: string };

function parseMessages(raw: unknown): { ok: true; messages: ChatMessage[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Campo messages deve ser um array." };
  }
  if (raw.length > MAX_MESSAGES) {
    return { ok: false, error: `No máximo ${MAX_MESSAGES} mensagens.` };
  }

  const messages: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Mensagem inválida." };
    }
    const m = item as Record<string, unknown>;
    if (m.role !== "user" && m.role !== "assistant") {
      return { ok: false, error: "Papel da mensagem deve ser user ou assistant." };
    }
    if (typeof m.content !== "string") {
      return { ok: false, error: "Conteúdo da mensagem deve ser texto." };
    }
    const maxChars = m.role === "user" ? MAX_CONTENT_CHARS : MAX_STORED_CONTENT_CHARS;
    if (m.content.length > maxChars) {
      return {
        ok: false,
        error: `Mensagem excede ${maxChars} caracteres.`,
      };
    }
    messages.push({ role: m.role as ChatRole, content: m.content });
  }
  return { ok: true, messages };
}

/** Merge partial session into the in-memory store. */
export function setChatSession(body: unknown): SetChatSessionResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "JSON inválido." };
  }
  const rec = body as Record<string, unknown>;
  const next: ChatSession = getChatSession();

  if ("messages" in rec) {
    const parsed = parseMessages(rec.messages);
    if (!parsed.ok) return parsed;
    next.messages = parsed.messages;
  }

  if ("open" in rec) {
    if (typeof rec.open !== "boolean") {
      return { ok: false, error: "Campo open deve ser boolean." };
    }
    next.open = rec.open;
  }

  if ("model" in rec) {
    if (typeof rec.model !== "string" || !isAllowedGeminiModel(rec.model)) {
      return { ok: false, error: "Modelo inválido." };
    }
    next.model = rec.model;
  }

  session = next;
  return { ok: true, session: getChatSession() };
}
