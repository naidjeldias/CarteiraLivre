"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { friendlyAgentError } from "@/lib/agent/errors";
import { AssistantMessageBody } from "@/lib/agent/format-message";
import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS, type GeminiModelOption } from "@/lib/agent/models";
import {
  buildPortfolioSummary,
  emptyPortfolioSummary,
} from "@/lib/agent/portfolio-summary";
import type { PortfolioSnapshot } from "@/lib/types";

type Role = "user" | "assistant";

interface ChatMessage {
  role: Role;
  content: string;
}

const PORTFOLIO_SUGGESTIONS = [
  "Quanto % em FIIs?",
  "Minha maior posição?",
  "Estou concentrado?",
  "Papel vs tijolo?",
];

function fiiSuggestions(ticker: string): string[] {
  return [
    `Como está ${ticker}?`,
    "Vacância e P/VP",
    "Últimos comunicados",
    "DY e proventos",
  ];
}

function ModelPicker({
  models,
  value,
  onChange,
  disabled,
}: {
  models: GeminiModelOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = models.find((m) => m.id === value) ?? models[0];

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="assistant-model" ref={rootRef}>
      <button
        type="button"
        className="assistant-model-btn"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Modelo Gemini"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current?.label ?? "Modelo"}</span>
      </button>
      {open && (
        <ul className="assistant-model-list" role="listbox" aria-label="Modelo Gemini">
          {models.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={m.id === value}
                className={m.id === value ? "is-selected" : undefined}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                <span>{m.label}</span>
                {m.hint && <span className="assistant-model-hint">{m.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ThinkingDots({ label }: { label?: string | null }) {
  return (
    <div className="assistant-thinking" role="status" aria-live="polite">
      <span className="assistant-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="assistant-thinking-label">{label || "Pensando…"}</span>
    </div>
  );
}

async function fetchAgentStatus(): Promise<{
  configured: boolean;
  defaultModel?: string;
  models?: GeminiModelOption[];
}> {
  const res = await fetch("/api/agent/chat");
  return res.json();
}

interface AssistantSessionPayload {
  messages: ChatMessage[];
  open: boolean;
  model: string;
}

async function fetchAssistantSession(): Promise<AssistantSessionPayload | null> {
  try {
    const res = await fetch("/api/agent/session");
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<AssistantSessionPayload>;
    if (!Array.isArray(data.messages)) return null;
    const messages: ChatMessage[] = [];
    for (const item of data.messages) {
      if (!item || typeof item !== "object") continue;
      if (item.role !== "user" && item.role !== "assistant") continue;
      if (typeof item.content !== "string") continue;
      messages.push({ role: item.role, content: item.content });
    }
    return {
      messages,
      open: typeof data.open === "boolean" ? data.open : true,
      model: typeof data.model === "string" ? data.model : DEFAULT_GEMINI_MODEL,
    };
  } catch {
    return null;
  }
}

function persistAssistantSession(payload: AssistantSessionPayload): void {
  void fetch("/api/agent/session", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // best-effort — process memory may be unavailable
  });
}

function parseSseBuffer(buffer: string): { events: unknown[]; rest: string } {
  const chunks = buffer.split("\n\n");
  const rest = chunks.pop() ?? "";
  const events: unknown[] = [];
  for (const chunk of chunks) {
    const line = chunk.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(6)));
    } catch {
      // ignore malformed frames
    }
  }
  return { events, rest };
}

export function PortfolioAssistant({
  snapshot,
  focusTicker,
}: {
  snapshot: PortfolioSnapshot | null;
  focusTicker?: string;
}) {
  const portfolioSummary = useMemo(
    () => (snapshot ? buildPortfolioSummary(snapshot) : emptyPortfolioSummary()),
    [snapshot]
  );
  const suggestions = focusTicker ? fiiSuggestions(focusTicker) : PORTFOLIO_SUGGESTIONS;
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [model, setModel] = useState(DEFAULT_GEMINI_MODEL);
  const [models, setModels] = useState<GeminiModelOption[]>(GEMINI_MODELS);
  const [hydrated, setHydrated] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const skipAbortErrorRef = useRef(false);
  const hydratedRef = useRef(false);
  const sessionRef = useRef<AssistantSessionPayload>({
    messages: [],
    open: true,
    model: DEFAULT_GEMINI_MODEL,
  });
  sessionRef.current = { messages, open, model };

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAgentStatus(), fetchAssistantSession()])
      .then(([s, session]) => {
        if (cancelled) return;
        setConfigured(s.configured);
        if (s.models?.length) setModels(s.models);
        if (session) {
          setMessages(session.messages);
          setOpen(session.open);
          setModel(session.model || s.defaultModel || DEFAULT_GEMINI_MODEL);
        } else if (s.defaultModel) {
          setModel(s.defaultModel);
        }
        hydratedRef.current = true;
        setHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        setConfigured(false);
        hydratedRef.current = true;
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const payload: AssistantSessionPayload = { messages, open, model };
    const flush = () => persistAssistantSession(payload);

    if (busy) {
      if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(flush, 400);
      return () => {
        if (saveTimerRef.current != null) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
      };
    }

    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    flush();
  }, [messages, open, model, busy, hydrated]);

  useEffect(() => {
    skipAbortErrorRef.current = false;
    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      skipAbortErrorRef.current = true;
      abortRef.current?.abort();
      if (hydratedRef.current) {
        persistAssistantSession(sessionRef.current);
      }
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, status, open]);

  async function send(text: string, history: ChatMessage[] = messages) {
    const content = text.trim();
    if (!content || busy) return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 90_000);

    setOpen(true);
    const nextMessages: ChatMessage[] = [...history, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError(null);
    setStatus(null);

    const fail = (err: unknown) => {
      setMessages(nextMessages);
      setError(friendlyAgentError(err));
    };

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          portfolio: portfolioSummary,
          model,
          ...(focusTicker ? { focusTicker } : {}),
        }),
        signal: abort.signal,
      });

      if (!res.ok) {
        let raw = `HTTP ${res.status}`;
        try {
          const data = (await res.json()) as { error?: string; configured?: boolean };
          if (data.error) raw = data.error;
          if (res.status === 503 && data.configured === false) setConfigured(false);
        } catch {
          // keep raw
        }
        fail(raw);
        return;
      }

      if (!res.body) {
        fail("Resposta vazia do assistente.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assembled = "";
      let hadError = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseBuffer(buffer);
        buffer = parsed.rest;
        for (const event of parsed.events) {
          if (!event || typeof event !== "object") continue;
          const ev = event as { type?: string; text?: string; message?: string };
          if (ev.type === "status" && ev.message) {
            setStatus(ev.message);
          } else if (ev.type === "delta" && ev.text) {
            assembled += ev.text;
            setStatus(null);
            setMessages([...nextMessages, { role: "assistant", content: assembled }]);
          } else if (ev.type === "error" && ev.message) {
            hadError = true;
            fail(ev.message);
            void reader.cancel();
            return;
          }
        }
      }

      if (!assembled && !hadError) {
        fail("O assistente não devolveu texto.");
      }
    } catch (e) {
      if (abort.signal.aborted) {
        if (!skipAbortErrorRef.current) {
          fail("A resposta demorou demais. Tente de novo.");
        }
      } else {
        fail(e);
      }
    } finally {
      window.clearTimeout(timeout);
      if (abortRef.current === abort) abortRef.current = null;
      setBusy(false);
      setStatus(null);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  if (!open) {
    return (
      <button type="button" className="assistant-fab" onClick={() => setOpen(true)}>
        Assistente
        {messages.length > 0 && <span className="assistant-fab-dot" />}
      </button>
    );
  }

  return (
    <section className="assistant-float" aria-label="Assistente da carteira">
      <header className="assistant-float-head">
        <h2>Assistente</h2>
        <ModelPicker
          models={models}
          value={model}
          onChange={setModel}
          disabled={busy || configured === false}
        />
        <button
          type="button"
          className="assistant-min"
          onClick={() => setOpen(false)}
          aria-label="Minimizar"
          title="Minimizar"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M6.7 9.3a1 1 0 0 1 1.4 0L12 13.17l3.9-3.88a1 1 0 1 1 1.4 1.42l-4.6 4.58a1 1 0 0 1-1.4 0L6.7 10.7a1 1 0 0 1 0-1.4Z"
            />
          </svg>
        </button>
      </header>

      {configured === false && (
        <p className="hint assistant-config-hint">
          Configure <code>GEMINI_API_KEY</code> em <code>.env.local</code> e recrie o container.
        </p>
      )}

      {messages.length === 0 && (
        <div className="assistant-chips">
          {suggestions.map((q) => (
            <button
              key={q}
              type="button"
              className="btn btn-ghost assistant-chip"
              disabled={busy || configured === false}
              onClick={() => void send(q)}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="assistant-log" ref={listRef}>
        {messages.length === 0 && (
          <p className="hint">
            {focusTicker
              ? `Pergunte sobre ${focusTicker}, indicadores ou comunicados recentes.`
              : "Pergunte sobre alocação, concentração ou um FII."}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={`${m.role}-${i}`} className={`assistant-msg ${m.role}`}>
            <span className="assistant-role">{m.role === "user" ? "Você" : "Assistente"}</span>
            <div className="assistant-bubble">
              {m.role === "assistant" ? (
                <>
                  {m.content ? <AssistantMessageBody text={m.content} /> : null}
                  {busy && i === messages.length - 1 && m.content ? (
                    <span className="assistant-caret" aria-hidden="true" />
                  ) : null}
                </>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {busy && !(messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1].content) && (
          <div className="assistant-msg assistant">
            <span className="assistant-role">Assistente</span>
            <div className="assistant-bubble">
              <ThinkingDots label={status} />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="assistant-banner" role="alert">
          <p>{error}</p>
          <div className="assistant-banner-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setError(null)}>
              Fechar
            </button>
            {messages[messages.length - 1]?.role === "user" && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => {
                  const last = messages[messages.length - 1];
                  void send(last.content, messages.slice(0, -1));
                }}
              >
                Tentar de novo
              </button>
            )}
          </div>
        </div>
      )}

      <form className="assistant-form" onSubmit={onSubmit}>
        <input
          className="assistant-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            focusTicker ? `Pergunte sobre ${focusTicker}…` : "Pergunte sobre a carteira…"
          }
          disabled={configured === false}
          maxLength={4000}
        />
        <button className="btn" type="submit" disabled={configured === false || !input.trim() || busy}>
          {busy ? "…" : "Enviar"}
        </button>
      </form>
    </section>
  );
}
