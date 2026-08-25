"use client";

import { formatBRL } from "@/lib/allocation";
import type { FiiFundamentals } from "@/lib/fii-fundamentals";
import type { PriceSignal } from "@/lib/fii-score";
import type { FiiTipo } from "@/lib/types";

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR");
}

function signalClass(label: PriceSignal["label"]): string {
  if (label === "atrativo") return "signal atrativo";
  if (label === "neutro") return "signal neutro";
  if (label === "cautela") return "signal cautela";
  return "signal insuficiente";
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="metric-card">
      <p className="stat-label">{label}</p>
      <p className="metric-value">{value}</p>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function FiiAnalysisPanel({
  tipo,
  fundamentals,
  priceSignal,
  bolsaiConfigured,
}: {
  tipo: FiiTipo;
  fundamentals: FiiFundamentals | null;
  priceSignal: PriceSignal;
  bolsaiConfigured: boolean;
}) {
  const f = fundamentals;
  const pct = (n: number | null | undefined, digits = 1) => fmtPct(n, digits);

  return (
    <div className="analysis-stack">
      <section className="panel detail-panel">
        <h2>Indicadores por tipo — {tipo}</h2>
        {!f && (
          <p className="hint">
            {bolsaiConfigured
              ? "Não foi possível carregar fundamentos da bolsai para este ticker."
              : "Para vacância, P/VP e composição, configure BOLSAI_API_KEY em .env.local (grátis em usebolsai.com). O score abaixo ainda usa proventos + DY quando disponíveis."}
          </p>
        )}

        <div className="metrics-grid">
          <Metric
            label="P/VP"
            value={f?.pvp != null && Number.isFinite(f.pvp) ? f.pvp.toFixed(2) : "—"}
          />
          <Metric
            label="DY 12m"
            value={pct(f?.dividendYieldTtm)}
            hint={f?.dividendYieldTtm == null ? "pode vir dos proventos" : undefined}
          />
          <Metric
            label="VP / cota"
            value={f?.bookValuePerShare != null ? formatBRL(f.bookValuePerShare) : "—"}
          />
          <Metric label="Cotistas" value={fmtNum(f?.totalShareholders)} />
        </div>

        {(tipo === "tijolo" || tipo === "desenvolvimento" || f?.vacancyPct != null) && (
          <>
            <h3 className="chart-subtitle">Tijolo / imóveis</h3>
            <div className="metrics-grid">
              <Metric label="Vacância" value={pct(f?.vacancyPct)} />
              <Metric label="Área locada" value={pct(f?.leasedPct)} />
              <Metric label="Imóveis" value={fmtNum(f?.propertyCount)} />
              <Metric
                label="ABL total"
                value={
                  f?.totalAreaSqm != null
                    ? `${Math.round(f.totalAreaSqm).toLocaleString("pt-BR")} m²`
                    : "—"
                }
              />
            </div>
            {f?.topProperties && f.topProperties.length > 0 && (
              <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Principal imóvel</th>
                      <th>Endereço</th>
                      <th className="num">% receita</th>
                      <th className="num">Vacância</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.topProperties.map((p) => (
                      <tr key={p.name + (p.address || "")}>
                        <td>{p.name}</td>
                        <td>{p.address || "—"}</td>
                        <td className="num">{pct(p.revenuePct)}</td>
                        <td className="num">{pct(p.vacancyPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {(tipo === "papel" || (f?.delinquencyPct != null && tipo !== "tijolo")) && (
          <>
            <h3 className="chart-subtitle">Papel / crédito</h3>
            <div className="metrics-grid">
              <Metric label="Inadimplência" value={pct(f?.delinquencyPct)} />
              <Metric label="% CRI" value={pct(f?.assetComposition?.criPct)} />
              <Metric label="% caixa" value={pct(f?.assetComposition?.cashPct)} />
              <Metric label="Mandato" value={f?.mandate || "—"} />
            </div>
          </>
        )}

        {(tipo === "fof" || tipo === "hibrido" || (f?.assetComposition?.fiiHoldingsPct ?? 0) > 20) && (
          <>
            <h3 className="chart-subtitle">FoF / híbrido</h3>
            <div className="metrics-grid">
              <Metric label="% em FIIs" value={pct(f?.assetComposition?.fiiHoldingsPct)} />
              <Metric label="% imóveis" value={pct(f?.assetComposition?.realEstateLeasedPct)} />
              <Metric label="% CRI" value={pct(f?.assetComposition?.criPct)} />
              <Metric label="% ações" value={pct(f?.assetComposition?.stocksPct)} />
            </div>
          </>
        )}

        {f && (
          <p className="hint" style={{ marginTop: "0.75rem" }}>
            Segmento: {f.segment || "—"} · Gestão: {f.managementType || "—"} · Admin:{" "}
            {f.administrator || "—"}
            {f.referenceDate ? ` · Ref. ${f.referenceDate}` : ""}
          </p>
        )}
      </section>

      <section className="panel detail-panel">
        <h2>Sinal de preço</h2>
        <div className="score-header">
          <div className={signalClass(priceSignal.label)}>
            <p className="stat-label">Score</p>
            <p className="score-number">
              {priceSignal.total != null ? priceSignal.total : "—"}
              {priceSignal.total != null && <span className="score-max">/100</span>}
            </p>
            <p className="score-label-text">{priceSignal.label}</p>
          </div>
          <p className="hint score-summary">{priceSignal.summary}</p>
        </div>

        <div className="breakdown-list">
          {priceSignal.breakdown.map((item) => (
            <div key={item.id} className="breakdown-row">
              <div className="breakdown-top">
                <span>
                  {item.label}
                  <span className="hint"> · peso {item.weight}</span>
                </span>
                <span className="num">
                  {item.score != null ? `${Math.round(item.score)}` : "n/d"}
                </span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${item.score != null ? Math.max(item.score, 2) : 0}%`,
                    opacity: item.score == null ? 0.25 : 1,
                  }}
                />
              </div>
              <p className="hint breakdown-detail">{item.detail}</p>
            </div>
          ))}
        </div>

        <p className="hint" style={{ marginTop: "0.85rem" }}>
          {priceSignal.disclaimer}
        </p>
      </section>
    </div>
  );
}
