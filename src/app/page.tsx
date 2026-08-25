"use client";

import { useCallback, useEffect, useState } from "react";
import {
  allocationByAssetClass,
  allocationByFiiSegmento,
  allocationByFiiTipo,
  filterFiis,
  totalValue,
} from "@/lib/allocation";
import { lookupFii } from "@/lib/fii-catalog";
import { parseB3Xlsx } from "@/lib/parse-b3";
import {
  clearPortfolioSnapshot,
  loadPortfolioSnapshot,
  savePortfolioSnapshot,
} from "@/lib/portfolio-storage";
import {
  fetchMarketQuotes,
  fetchQuotesStatus,
  loadQuotesCache,
  marketValue,
  quoteableTickers,
  totalMarketValue,
  vsExtractPct,
  type QuotesMap,
} from "@/lib/quotes";
import type { PortfolioSnapshot } from "@/lib/types";
import { PortfolioAssistant } from "@/components/PortfolioAssistant";
import { ValuesToggle } from "@/components/ValuesToggle";
import { useShowValues } from "@/hooks/useShowValues";
import {
  formatBRLSensitive,
  formatPctSensitive,
  formatSignedPctSensitive,
} from "@/lib/format-sensitive";

function openFiiDetail(ticker: string) {
  // Mesma aba: histórico do browser + snapshot no localStorage
  window.location.href = `/fii/${encodeURIComponent(ticker)}`;
}

function AllocationBars({
  title,
  slices,
  showValues,
}: {
  title: string;
  slices: { key: string; value: number; weight: number }[];
  showValues: boolean;
}) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {slices.length === 0 ? (
        <p className="hint">Sem dados.</p>
      ) : (
        <div className="bar-list">
          {slices.map((s) => (
            <div className="bar-row" key={s.key}>
              <span>{s.key}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.max(s.weight * 100, 1)}%` }} />
              </div>
              <span className="bar-pct">{formatPctSensitive(s.weight, showValues)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function deltaClass(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct) || pct === 0) return "delta";
  return pct > 0 ? "delta up" : "delta down";
}

export default function HomePage() {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [quotes, setQuotes] = useState<QuotesMap | null>(null);
  const [quotesAt, setQuotesAt] = useState<string | null>(null);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [brapiConfigured, setBrapiConfigured] = useState<boolean | null>(null);
  const { showValues, toggleShowValues } = useShowValues();

  useEffect(() => {
    const saved = loadPortfolioSnapshot();
    if (saved) setSnapshot(saved);

    fetchQuotesStatus()
      .then((s) => setBrapiConfigured(s.configured))
      .catch(() => setBrapiConfigured(false));
    const cached = loadQuotesCache();
    if (cached) {
      setQuotes(cached.quotes);
      setQuotesAt(cached.fetchedAt);
    }
  }, []);

  function applySnapshot(next: PortfolioSnapshot | null) {
    setSnapshot(next);
    if (next) savePortfolioSnapshot(next);
    else clearPortfolioSnapshot();
  }

  const refreshQuotes = useCallback(async (positions: PortfolioSnapshot["positions"]) => {
    const symbols = quoteableTickers(positions);
    if (symbols.length === 0) {
      setQuotesError("Nenhum ativo cotável (ações/FIIs/ETFs/BDRs) na posição.");
      return;
    }
    setQuotesLoading(true);
    setQuotesError(null);
    try {
      const { quotes: map, fetchedAt } = await fetchMarketQuotes(symbols);
      setQuotes(map);
      setQuotesAt(fetchedAt);
      const failed = Object.values(map).filter((q) => q.error).length;
      if (failed > 0) {
        setQuotesError(`${failed} ticker(s) sem cotação (ex.: recibos *12 ou token/limites).`);
      }
    } catch (e) {
      setQuotesError(e instanceof Error ? e.message : "Falha ao atualizar cotações.");
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  async function onFileChange(file: File | null) {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const parsed = await parseB3Xlsx(file);
      if (parsed.positions.length === 0) {
        setError("Nenhuma posição encontrada. Confira se o arquivo é o extrato/posição da B3.");
        applySnapshot(null);
      } else {
        applySnapshot(parsed);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
      applySnapshot(null);
    } finally {
      setLoading(false);
    }
  }

  function clearPortfolio() {
    applySnapshot(null);
    setQuotes(null);
    setQuotesAt(null);
    setQuotesError(null);
    setError(null);
  }

  const patrimonioExtrato = snapshot ? totalValue(snapshot.positions) : 0;
  const patrimonioMercado = snapshot ? totalMarketValue(snapshot.positions, quotes) : 0;
  const fiis = snapshot ? filterFiis(snapshot.positions) : [];
  const fiiTotalExtrato = totalValue(fiis);
  const fiiTotalMercado = totalMarketValue(fiis, quotes);
  const hasQuotes = Boolean(quotes && Object.keys(quotes).length > 0);
  const mtmDeltaPct =
    patrimonioExtrato > 0 ? ((patrimonioMercado - patrimonioExtrato) / patrimonioExtrato) * 100 : null;

  return (
    <main>
      <div className="page-top">
        <div className="page-top-intro">
          <h1 className="brand">CarteiraLivre</h1>
          <p className="tagline">
            Importe o <code>.xlsx</code> da B3 no seu navegador. Sem conta, sem mensalidade — seus
            dados ficam locais. Cotações opcionais via brapi (plano Free).
          </p>
        </div>
        <ValuesToggle
          showValues={showValues}
          onToggle={toggleShowValues}
          className="page-values-toggle"
        />
      </div>

      <div className="upload">
        <label htmlFor="xlsx">Arquivo de posição B3 (.xlsx)</label>
        <input
          id="xlsx"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={loading}
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
        <p className="hint">
          O extrato não é enviado à brapi. A posição fica salva neste navegador (localStorage)
          para você voltar da página do FII sem perder os dados. Token em{" "}
          <code>.env.local</code>.
        </p>
        {loading && <p className="hint">Lendo arquivo…</p>}
        {error && <p className="error">{error}</p>}
      </div>

      {snapshot && (
        <>
          <div className="toolbar">
            <button
              type="button"
              className="btn"
              disabled={quotesLoading || brapiConfigured === false}
              onClick={() => refreshQuotes(snapshot.positions)}
            >
              {quotesLoading ? "Atualizando cotações…" : "Atualizar preços (brapi)"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={clearPortfolio}>
              Limpar carteira
            </button>
            {brapiConfigured === false && (
              <p className="hint">
                Configure <code>BRAPI_TOKEN</code> em <code>.env.local</code> e reinicie (
                <code>npm run dev</code> ou <code>docker compose up</code>). Veja{" "}
                <code>.env.example</code>.
              </p>
            )}
            {brapiConfigured && quotesAt && (
              <p className="hint">
                Cotações em cache: {new Date(quotesAt).toLocaleString("pt-BR")}
              </p>
            )}
            {quotesError && <p className="error">{quotesError}</p>}
          </div>

          <div className="grid stats">
            <section className="panel">
              <p className="stat-label">Patrimônio (extrato B3)</p>
              <p className="stat-value">{formatBRLSensitive(patrimonioExtrato, showValues)}</p>
            </section>
            <section className="panel">
              <p className="stat-label">Patrimônio (mercado)</p>
              <p className="stat-value">
                {formatBRLSensitive(hasQuotes ? patrimonioMercado : patrimonioExtrato, showValues)}
              </p>
              {hasQuotes && mtmDeltaPct != null && (
                <p className={deltaClass(mtmDeltaPct)}>
                  vs extrato {formatSignedPctSensitive(mtmDeltaPct, showValues)}
                </p>
              )}
            </section>
            <section className="panel">
              <p className="stat-label">FIIs (mercado)</p>
              <p className="stat-value">
                {formatBRLSensitive(hasQuotes ? fiiTotalMercado : fiiTotalExtrato, showValues)}
              </p>
            </section>
          </div>

          <div className="grid charts">
            <AllocationBars
              title="Alocação por classe"
              slices={allocationByAssetClass(snapshot)}
              showValues={showValues}
            />
            <AllocationBars
              title="FIIs por tipo (papel / tijolo…)"
              slices={allocationByFiiTipo(snapshot)}
              showValues={showValues}
            />
            <AllocationBars
              title="FIIs por segmento"
              slices={allocationByFiiSegmento(snapshot)}
              showValues={showValues}
            />
          </div>

          <PortfolioAssistant snapshot={snapshot} />

          <section className="panel" style={{ marginTop: "1rem" }}>
            <h2>Fundos imobiliários</h2>
            <p className="hint" style={{ marginBottom: "0.75rem" }}>
              Clique em um FII para ver cotação e dividendos. Ao voltar, a carteira importada
              permanece.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Tipo</th>
                    <th>Segmento</th>
                    <th className="num">Qtd</th>
                    <th className="num">Preço extrato</th>
                    <th className="num">Preço mercado</th>
                    <th className="num">Δ vs extrato</th>
                    <th className="num">Valor</th>
                    <th className="num">% FIIs</th>
                  </tr>
                </thead>
                <tbody>
                  {fiis.map((p) => {
                    const meta = lookupFii(p.ticker);
                    const unknown = meta.tipo === "desconhecido";
                    const q = quotes?.[p.ticker];
                    const mktPrice = q && !q.error ? q.price : null;
                    const vs = mktPrice != null ? vsExtractPct(p.price, mktPrice) : null;
                    const val = marketValue(p, quotes);
                    const fiiBase = hasQuotes ? fiiTotalMercado : fiiTotalExtrato;
                    return (
                      <tr
                        key={`${p.ticker}-${p.broker ?? ""}`}
                        className="clickable"
                        onClick={() => openFiiDetail(p.ticker)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openFiiDetail(p.ticker);
                          }
                        }}
                        tabIndex={0}
                        title={`Abrir detalhes de ${p.ticker}`}
                      >
                        <td>
                          <span className="ticker-link">{p.ticker}</span>
                        </td>
                        <td>
                          <span className={`badge${unknown ? " warn" : ""}`}>{meta.tipo}</span>
                        </td>
                        <td>{meta.segmento}</td>
                        <td className="num">{p.quantity.toLocaleString("pt-BR")}</td>
                        <td className="num">{formatBRLSensitive(p.price, showValues)}</td>
                        <td className="num">
                          {mktPrice != null ? formatBRLSensitive(mktPrice, showValues) : q?.error ? "—" : "—"}
                        </td>
                        <td className={`num ${deltaClass(vs)}`}>
                          {vs != null ? formatSignedPctSensitive(vs, showValues) : "—"}
                        </td>
                        <td className="num">{formatBRLSensitive(val, showValues)}</td>
                        <td className="num">{formatPctSensitive(fiiBase ? val / fiiBase : 0, showValues)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel" style={{ marginTop: "1rem" }}>
            <h2>Todas as posições</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Classe</th>
                    <th className="num">Qtd</th>
                    <th className="num">Preço extrato</th>
                    <th className="num">Preço mercado</th>
                    <th className="num">Valor</th>
                    <th className="num">% carteira</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.positions.map((p) => {
                    const q = quotes?.[p.ticker];
                    const mktPrice = q && !q.error ? q.price : null;
                    const val = marketValue(p, quotes);
                    const base = hasQuotes ? patrimonioMercado : patrimonioExtrato;
                    return (
                      <tr key={`${p.ticker}-${p.broker ?? ""}-${p.assetClass}`}>
                        <td>{p.ticker}</td>
                        <td>{p.assetClass}</td>
                        <td className="num">{p.quantity.toLocaleString("pt-BR")}</td>
                        <td className="num">{formatBRLSensitive(p.price, showValues)}</td>
                        <td className="num">
                          {mktPrice != null ? formatBRLSensitive(mktPrice, showValues) : "—"}
                        </td>
                        <td className="num">{formatBRLSensitive(val, showValues)}</td>
                        <td className="num">{formatPctSensitive(base ? val / base : 0, showValues)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
