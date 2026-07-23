"use client";

import { useCallback, useEffect, useState } from "react";
import {
  allocationByAssetClass,
  allocationByFiiSegmento,
  allocationByFiiTipo,
  filterFiis,
  formatBRL,
  formatPct,
  totalValue,
} from "@/lib/allocation";
import { lookupFii } from "@/lib/fii-catalog";
import { parseB3Xlsx } from "@/lib/parse-b3";
import {
  fetchMarketQuotes,
  fetchQuotesStatus,
  formatSignedPct,
  loadQuotesCache,
  marketValue,
  quoteableTickers,
  totalMarketValue,
  vsExtractPct,
  type QuotesMap,
} from "@/lib/quotes";
import type { PortfolioSnapshot } from "@/lib/types";

function AllocationBars({
  title,
  slices,
}: {
  title: string;
  slices: { key: string; value: number; weight: number }[];
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
              <span className="bar-pct">{formatPct(s.weight)}</span>
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

  useEffect(() => {
    fetchQuotesStatus()
      .then((s) => setBrapiConfigured(s.configured))
      .catch(() => setBrapiConfigured(false));
    const cached = loadQuotesCache();
    if (cached) {
      setQuotes(cached.quotes);
      setQuotesAt(cached.fetchedAt);
    }
  }, []);

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
        setSnapshot(null);
      } else {
        setSnapshot(parsed);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
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
      <h1 className="brand">CarteiraLivre</h1>
      <p className="tagline">
        Importe o <code>.xlsx</code> da B3 no seu navegador. Sem conta, sem mensalidade — seus
        dados ficam locais. Cotações opcionais via brapi (plano Free).
      </p>

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
          O extrato não é enviado à brapi. Só os tickers vão à API de cotação (via servidor local),
          com token em <code>.env.local</code>.
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
            {brapiConfigured === false && (
              <p className="hint">
                Configure <code>BRAPI_TOKEN</code> em <code>.env.local</code> e reinicie o{" "}
                <code>npm run dev</code>. Veja <code>.env.example</code>.
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
              <p className="stat-value">{formatBRL(patrimonioExtrato)}</p>
            </section>
            <section className="panel">
              <p className="stat-label">Patrimônio (mercado)</p>
              <p className="stat-value">{formatBRL(hasQuotes ? patrimonioMercado : patrimonioExtrato)}</p>
              {hasQuotes && mtmDeltaPct != null && (
                <p className={deltaClass(mtmDeltaPct)}>
                  vs extrato {formatSignedPct(mtmDeltaPct)}
                </p>
              )}
            </section>
            <section className="panel">
              <p className="stat-label">FIIs (mercado)</p>
              <p className="stat-value">
                {formatBRL(hasQuotes ? fiiTotalMercado : fiiTotalExtrato)}
              </p>
            </section>
          </div>

          <div className="grid charts">
            <AllocationBars title="Alocação por classe" slices={allocationByAssetClass(snapshot)} />
            <AllocationBars title="FIIs por tipo (papel / tijolo…)" slices={allocationByFiiTipo(snapshot)} />
            <AllocationBars title="FIIs por segmento" slices={allocationByFiiSegmento(snapshot)} />
          </div>

          <section className="panel" style={{ marginTop: "1rem" }}>
            <h2>Fundos imobiliários</h2>
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
                      <tr key={`${p.ticker}-${p.broker ?? ""}`}>
                        <td>{p.ticker}</td>
                        <td>
                          <span className={`badge${unknown ? " warn" : ""}`}>{meta.tipo}</span>
                        </td>
                        <td>{meta.segmento}</td>
                        <td className="num">{p.quantity.toLocaleString("pt-BR")}</td>
                        <td className="num">{formatBRL(p.price)}</td>
                        <td className="num">
                          {mktPrice != null ? formatBRL(mktPrice) : q?.error ? "—" : "—"}
                        </td>
                        <td className={`num ${deltaClass(vs)}`}>
                          {vs != null ? formatSignedPct(vs) : "—"}
                        </td>
                        <td className="num">{formatBRL(val)}</td>
                        <td className="num">{formatPct(fiiBase ? val / fiiBase : 0)}</td>
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
                        <td className="num">{formatBRL(p.price)}</td>
                        <td className="num">{mktPrice != null ? formatBRL(mktPrice) : "—"}</td>
                        <td className="num">{formatBRL(val)}</td>
                        <td className="num">{formatPct(base ? val / base : 0)}</td>
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
