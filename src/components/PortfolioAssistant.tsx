"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS, type GeminiModelOption } from "@/lib/agent/models";
import { buildPortfolioSummary } from "@/lib/agent/portfolio-summary";
import type { PortfolioSnapshot } from "@/lib/types";

type Role = "user" | "assistant";

interface ChatMessage {
  role: Role;
  content: string;
}

const SUGGESTIONS = [
  "Quanto % em FIIs?",
  "Minha maior posição?",
  "Estou concentrado?",
  "Papel vs tijolo?",
];

async function fetchAgentStatus(): Promise<{
  configured: boolean;
  defaultModel?: string;
  models?: GeminiModelOption[];
}> {
  const res = await fetch("/api/agent/chat");
  return res.json();
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

export function PortfolioAssistant({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [model, setModel] = useState(DEFAULT_GEMINI_MODEL);
  const [models, setModels] = useState<GeminiModelOption[]>(GEMINI_MODELS);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAgentStatus()
      .then((s) => {
        setConfigured(s.configured);
        if (s.models?.length) setModels(s.models);
        if (s.defaultModel) setModel(s.defaultModel);
      })
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, status]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError(null);
    setStatus(null);

    const assistant: ChatMessage = { role: "assistant", content: "" };
    setMessages([...nextMessages, assistant]);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          portfolio: buildPortfolioSummary(snapshot),
          model,
        }),
      });

      if (!res.ok) {
        let message = `Falha no assistente (${res.status}).`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          // keep default
        }
        if (res.status === 503) setConfigured(false);
        setMessages(nextMessages);
        setError(message);
        return;
      }

      if (!res.body) {
        setMessages(nextMessages);
        setError("Resposta vazia do assistente.");
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
            const snapshotMsgs = [...nextMessages, { role: "assistant" as const, content: assembled }];
            setMessages(snapshotMsgs);
          } else if (ev.type === "error" && ev.message) {
            hadError = true;
            setError(ev.message);
          }
        }
      }

      if (!assembled) {
        setMessages(nextMessages);
        if (!hadError) setError("O assistente não devolveu texto.");
      }
    } catch (e) {
      setMessages(nextMessages);
      setError(e instanceof Error ? e.message : "Falha ao falar com o assistente.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  return (
    <section className="panel assistant" style={{ marginTop: "1rem" }}>
      <h2>Assistente da carteira</h2>
      <p className="hint">
        Ao enviar, um <strong>resumo compacto</strong> da carteira (tickers, quantidades e valores —
        não o arquivo <code>.xlsx</code>) vai para o modelo Gemini. Respostas são educativas, não
        recomendação de investimento.
      </p>
      {configured === false && (
        <p className="hint">
          Configure <code>GEMINI_API_KEY</code> em <code>.env.local</code> e recrie o container (
          <code>docker compose up -d --force-recreate</code>). Veja <code>.env.example</code>.
        </p>
      )}

      <label className="assistant-model">
        <span>Modelo</span>
        <select
          value={model}
          disabled={busy || configured === false}
          onChange={(e) => setModel(e.target.value)}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.hint ? `${m.label} — ${m.hint}` : m.label}
            </option>
          ))}
        </select>
      </label>

      <div className="assistant-chips">
        {SUGGESTIONS.map((q) => (
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

      <div className="assistant-log" ref={listRef}>
        {messages.length === 0 && (
          <p className="hint">Pergunte sobre alocação, concentração ou um FII da carteira.</p>
        )}
        {messages.map((m, i) => (
          <div key={`${m.role}-${i}`} className={`assistant-msg ${m.role}`}>
            <span className="assistant-role">{m.role === "user" ? "Você" : "Assistente"}</span>
            <div className="assistant-bubble">{m.content || (busy && i === messages.length - 1 ? "…" : "")}</div>
          </div>
        ))}
        {status && <p className="hint assistant-status">{status}</p>}
      </div>

      {error && <p className="error">{error}</p>}

      <form className="assistant-form" onSubmit={onSubmit}>
        <input
          className="assistant-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte sobre a carteira…"
          disabled={busy || configured === false}
          maxLength={4000}
        />
        <button className="btn" type="submit" disabled={busy || configured === false || !input.trim()}>
          {busy ? "Enviando…" : "Enviar"}
        </button>
      </form>
    </section>
  );
}
