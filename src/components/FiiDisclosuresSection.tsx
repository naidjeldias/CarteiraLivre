"use client";

import { useCallback, useEffect, useState } from "react";
import { AssistantMessageBody } from "@/lib/agent/format-message";
import type { DisclosureType, FiiDisclosure } from "@/lib/disclosures/types";

interface EventsPayload {
  ticker: string;
  disclosures: FiiDisclosure[];
  syncedAt: string | null;
  stale: boolean;
  syncError: string | null;
  error?: string;
}

const TYPE_LABEL: Record<DisclosureType, string> = {
  fato_relevante: "Fato",
  informe_mensal: "Informe",
  informe_trimestral: "Informe",
  relatorio_gerencial: "Relatório",
  outro: "Outro",
};

function formatDateBR(iso: string): string {
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return iso;
  return `${day}/${m}/${y}`;
}

function ThinkingDots({ label }: { label?: string }) {
  return (
    <div className="assistant-thinking" role="status" aria-live="polite">
      <span className="assistant-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="assistant-thinking-label">{label || "Gerando resumo…"}</span>
    </div>
  );
}

export function FiiDisclosuresSection({ ticker }: { ticker: string }) {
  const [payload, setPayload] = useState<EventsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [geminiOn, setGeminiOn] = useState<boolean | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMarkdown, setAiMarkdown] = useState<string | null>(null);

  const applyPayload = useCallback((json: EventsPayload) => {
    setPayload(json);
    setListError(json.syncError);
  }, []);

  const loadCache = useCallback(async () => {
    const res = await fetch(`/api/fii-events?ticker=${encodeURIComponent(ticker)}`);
    const json = (await res.json()) as EventsPayload;
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    applyPayload(json);
    return json;
  }, [ticker, applyPayload]);

  const runSync = useCallback(async (force = false) => {
    setSyncing(true);
    try {
      const res = await fetch("/api/fii-events/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, force }),
      });
      const json = (await res.json()) as EventsPayload;
      if (!res.ok && !json.disclosures) {
        throw new Error(json.error || json.syncError || `HTTP ${res.status}`);
      }
      applyPayload(json);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Falha ao buscar documentos.");
    } finally {
      setSyncing(false);
    }
  }, [ticker, applyPayload]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setListError(null);
    setAiOpen(false);
    setAiMarkdown(null);
    setAiError(null);

    fetch("/api/fii-ai/summary")
      .then((r) => r.json())
      .then((s: { configured?: boolean }) => {
        if (!cancelled) setGeminiOn(Boolean(s.configured));
      })
      .catch(() => {
        if (!cancelled) setGeminiOn(false);
      });

    loadCache()
      .then((json) => {
        if (cancelled) return;
        if (json.stale) return runSync();
      })
      .catch((e) => {
        if (!cancelled) {
          setListError(e instanceof Error ? e.message : "Falha ao carregar comunicados.");
          return runSync();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, loadCache, runSync]);

  const requestSummary = useCallback(async () => {
    setAiOpen(true);
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch("/api/fii-ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      const json = (await res.json()) as { markdown?: string; error?: string; configured?: boolean };
      if (json.configured === false) setGeminiOn(false);
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (!json.markdown) throw new Error("Resumo vazio.");
      setAiMarkdown(json.markdown);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Falha ao gerar o resumo.");
    } finally {
      setAiBusy(false);
    }
  }, [ticker]);

  const items = payload?.disclosures ?? [];
  const firstLoad = (loading || syncing) && items.length === 0;

  return (
    <section className="panel detail-panel disclosure-panel">
      <div className="disclosure-head">
        <h2>Comunicados e informes recentes</h2>
        <button
          type="button"
          className="btn"
          disabled={geminiOn === false || aiBusy}
          title={
            geminiOn === false
              ? "GEMINI_API_KEY não configurado"
              : "Gerar resumo do estado atual"
          }
          onClick={() => {
            if (geminiOn === false) return;
            void requestSummary();
          }}
        >
          Resumo IA
        </button>
      </div>

      {geminiOn === false && (
        <p className="hint">
          Resumo IA indisponível: configure <code>GEMINI_API_KEY</code> em <code>.env.local</code> e
          recrie o container (<code>docker compose up -d --force-recreate</code>). A lista de
          documentos continua funcionando.
        </p>
      )}

      {aiOpen && (
        <div className="disclosure-ai-panel" aria-live="polite">
          {aiBusy && <ThinkingDots label="Analisando cotação, fundamentos e documentos…" />}
          {aiError && (
            <div className="assistant-banner">
              <p>{aiError}</p>
              <div className="assistant-banner-actions">
                <button type="button" className="btn" onClick={() => void requestSummary()}>
                  Tentar novamente
                </button>
              </div>
            </div>
          )}
          {!aiBusy && aiMarkdown && <AssistantMessageBody text={aiMarkdown} />}
        </div>
      )}

      {firstLoad && <p className="hint">Buscando documentos…</p>}
      {!firstLoad && listError && items.length === 0 && (
        <div>
          <p className="error">{listError}</p>
          <button type="button" className="btn btn-ghost" onClick={() => void runSync(true)} disabled={syncing}>
            Tentar novamente
          </button>
        </div>
      )}
      {!firstLoad && items.length === 0 && !listError && (
        <p className="hint">Nenhum comunicado recente no período retido.</p>
      )}
      {items.length > 0 && (
        <ul className="disclosure-list">
          {items.map((item) => (
            <li key={item.id} className="disclosure-item">
              <span className="badge">{TYPE_LABEL[item.type] || item.type}</span>
              <span className="disclosure-date">{formatDateBR(item.publishedAt)}</span>
              <a href={item.url} target="_blank" rel="noreferrer" className="disclosure-title">
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      )}
      {syncing && items.length > 0 && <p className="hint">Atualizando documentos em segundo plano…</p>}
      {listError && items.length > 0 && (
        <p className="hint">
          {listError}{" "}
          <button type="button" className="btn btn-ghost" onClick={() => void runSync(true)} disabled={syncing}>
            Tentar novamente
          </button>
        </p>
      )}
    </section>
  );
}
