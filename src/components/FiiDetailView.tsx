"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL, formatPct } from "@/lib/allocation";
import { lookupFii } from "@/lib/fii-catalog";
import type { FiiFundamentals } from "@/lib/fii-fundamentals";
import type { PriceSignal } from "@/lib/fii-score";
import { formatSignedPct } from "@/lib/quotes";
import type { FiiTipo } from "@/lib/types";
import { FiiAnalysisPanel } from "@/components/FiiAnalysisPanel";

interface QuoteInfo {
  price: number;
  changePercent?: number;
  shortName?: string;
  longName?: string;
  asOf?: string;
  previousClose?: number;
  dayHigh?: number;
  dayLow?: number;
}

interface PricePoint {
  date: string;
  close: number;
}

interface DividendRow {
  label: string;
  rate: number;
  paymentDate: string;
  lastDatePrior?: string;
  relatedTo?: string | null;
}

interface DetailPayload {
  ticker: string;
  quote: QuoteInfo | null;
  history: PricePoint[];
  dividends: DividendRow[];
  dividendsNote?: string;
  dividendsSource?: string | null;
  dividendYieldTtm?: number | null;
  ttmPerShare?: number | null;
  fundamentals?: FiiFundamentals | null;
  resolvedTipo?: FiiTipo;
  priceSignal?: PriceSignal;
  providers?: { brapiConfigured?: boolean; bolsaiConfigured?: boolean };
  fetchedAt: string;
  error?: string;
}

type TabId = "cotacao" | "dividendos";

function formatDateBR(iso: string): string {
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return iso;
  return `${day}/${m}/${y}`;
}

export function FiiDetailView({ ticker }: { ticker: string }) {
  const [tab, setTab] = useState<TabId>("cotacao");
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const meta = lookupFii(ticker);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/fii-detail?ticker=${encodeURIComponent(ticker)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Falha ao carregar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const chartData = useMemo(
    () =>
      (data?.history || []).map((p) => ({
        ...p,
        label: formatDateBR(p.date),
      })),
    [data]
  );

  const dividendSum = useMemo(
    () => (data?.dividends || []).reduce((s, d) => s + d.rate, 0),
    [data]
  );

  /** Agrega por mês (asc) para o gráfico de evolução. */
  const dividendChartData = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of data?.dividends || []) {
      const key = d.paymentDate.slice(0, 7); // YYYY-MM
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      map.set(key, (map.get(key) ?? 0) + d.rate);
    }
    const rows = [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, value]) => {
        const [y, m] = month.split("-");
        return {
          month,
          label: `${m}/${y.slice(2)}`,
          value,
        };
      });
    // últimos 18 meses no gráfico (tabela continua completa)
    return rows.slice(-18);
  }, [data]);

  const dividendAvg = useMemo(() => {
    if (!dividendChartData.length) return null;
    return dividendChartData.reduce((s, r) => s + r.value, 0) / dividendChartData.length;
  }, [dividendChartData]);

  const priceChange3m = useMemo(() => {
    if (!chartData.length) return null;
    const first = chartData[0].close;
    const last = chartData[chartData.length - 1].close;
    if (!first) return null;
    return ((last - first) / first) * 100;
  }, [chartData]);

  return (
    <main className="detail-page">
      <Link href="/" className="back-link">
        ← Voltar à carteira
      </Link>

      <header className="detail-header">
        <div>
          <h1 className="brand">{ticker}</h1>
          <p className="tagline" style={{ marginBottom: "0.5rem" }}>
            {data?.quote?.longName || data?.quote?.shortName || meta.name}
          </p>
          <div className="detail-meta">
            <span
              className={`badge${
                (data?.resolvedTipo || meta.tipo) === "desconhecido" ? " warn" : ""
              }`}
            >
              {data?.resolvedTipo || meta.tipo}
            </span>
            <span className="hint">
              {data?.fundamentals?.segment || meta.segmento}
            </span>
          </div>
        </div>
        {data?.quote && (
          <div className="detail-price">
            <p className="stat-label">Cotação</p>
            <p className="stat-value">{formatBRL(data.quote.price)}</p>
            {data.quote.changePercent != null && (
              <p
                className={
                  data.quote.changePercent >= 0 ? "delta up" : "delta down"
                }
              >
                dia {formatSignedPct(data.quote.changePercent)}
              </p>
            )}
          </div>
        )}
      </header>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "cotacao"}
          className={`tab${tab === "cotacao" ? " active" : ""}`}
          onClick={() => setTab("cotacao")}
        >
          Cotação
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "dividendos"}
          className={`tab${tab === "dividendos" ? " active" : ""}`}
          onClick={() => setTab("dividendos")}
        >
          Dividendos
        </button>
      </div>

      {loading && <p className="hint">Carregando dados da brapi…</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && data && tab === "cotacao" && (
        <section className="panel detail-panel">
          <h2>Preço — últimos ~3 meses</h2>
          <div className="grid stats detail-stats">
            <div>
              <p className="stat-label">Variação no período</p>
              <p
                className={`stat-value small ${
                  priceChange3m != null && priceChange3m >= 0 ? "up" : "down"
                }`}
              >
                {priceChange3m != null ? formatSignedPct(priceChange3m) : "—"}
              </p>
            </div>
            <div>
              <p className="stat-label">Máxima (dia)</p>
              <p className="stat-value small">
                {data.quote?.dayHigh != null ? formatBRL(data.quote.dayHigh) : "—"}
              </p>
            </div>
            <div>
              <p className="stat-label">Mínima (dia)</p>
              <p className="stat-value small">
                {data.quote?.dayLow != null ? formatBRL(data.quote.dayLow) : "—"}
              </p>
            </div>
          </div>

          {chartData.length === 0 ? (
            <p className="hint">Sem histórico de preço disponível.</p>
          ) : (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#2a3542" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#8b9aab", fontSize: 11 }}
                    minTickGap={40}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fill: "#8b9aab", fontSize: 11 }}
                    width={56}
                    tickFormatter={(v) =>
                      Number(v).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#1a222c",
                      border: "1px solid #2a3542",
                      borderRadius: 8,
                    }}
                    labelStyle={{ color: "#8b9aab" }}
                    formatter={(value: number) => [formatBRL(value), "Fechamento"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke="#3d9a6a"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {data.fetchedAt && (
            <p className="hint" style={{ marginTop: "0.75rem" }}>
              Atualizado em {new Date(data.fetchedAt).toLocaleString("pt-BR")}
            </p>
          )}
        </section>
      )}

      {!loading && !error && data && tab === "dividendos" && (
        <section className="panel detail-panel">
          <h2>Proventos recentes</h2>
          {(data.dividendYieldTtm != null || data.ttmPerShare != null) && (
            <div className="grid stats detail-stats">
              {data.dividendYieldTtm != null && (
                <div>
                  <p className="stat-label">DY 12m</p>
                  <p className="stat-value small">
                    {data.dividendYieldTtm.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    %
                  </p>
                </div>
              )}
              {data.ttmPerShare != null && (
                <div>
                  <p className="stat-label">Soma ~12m / cota</p>
                  <p className="stat-value small">{formatBRL(data.ttmPerShare)}</p>
                </div>
              )}
              {data.dividendsSource && (
                <div>
                  <p className="stat-label">Fonte</p>
                  <p className="stat-value small" style={{ fontSize: "1rem" }}>
                    {data.dividendsSource}
                  </p>
                </div>
              )}
            </div>
          )}
          {data.dividendsNote && <p className="hint">{data.dividendsNote}</p>}
          {data.dividends.length > 0 && !data.ttmPerShare && (
            <p className="hint" style={{ marginBottom: "0.75rem" }}>
              Soma no período listado: <strong>{formatBRL(dividendSum)}</strong> por
              cota
              {data.quote?.price
                ? ` (~${formatPct(dividendSum / data.quote.price)} sobre o preço atual)`
                : ""}
            </p>
          )}
          {data.dividends.length === 0 ? (
            <p className="hint">Nenhum dividendo para exibir.</p>
          ) : (
            <>
              <h3 className="chart-subtitle">Evolução mensal (R$/cota)</h3>
              {dividendAvg != null && (
                <p className="hint" style={{ marginBottom: "0.5rem" }}>
                  Média no gráfico: <strong>{formatBRL(dividendAvg)}</strong> / mês
                  {dividendChartData.length < (data.dividends.length || 0)
                    ? " · exibindo até 18 meses"
                    : ""}
                </p>
              )}
              <div className="chart-box">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dividendChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#2a3542" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#8b9aab", fontSize: 11 }}
                      interval="preserveStartEnd"
                      minTickGap={16}
                    />
                    <YAxis
                      tick={{ fill: "#8b9aab", fontSize: 11 }}
                      width={52}
                      tickFormatter={(v) =>
                        Number(v).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#1a222c",
                        border: "1px solid #2a3542",
                        borderRadius: 8,
                      }}
                      labelStyle={{ color: "#8b9aab" }}
                      formatter={(value: number) => [formatBRL(value), "Provento"]}
                      labelFormatter={(_, payload) => {
                        const month = payload?.[0]?.payload?.month as string | undefined;
                        if (!month) return "";
                        const [y, m] = month.split("-");
                        return `${m}/${y}`;
                      }}
                    />
                    {dividendAvg != null && (
                      <ReferenceLine
                        y={dividendAvg}
                        stroke="#c4a035"
                        strokeDasharray="4 4"
                        label={{
                          value: "média",
                          fill: "#c4a035",
                          fontSize: 11,
                          position: "insideTopRight",
                        }}
                      />
                    )}
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36}>
                      {dividendChartData.map((entry) => (
                        <Cell
                          key={entry.month}
                          fill={
                            dividendAvg != null && entry.value >= dividendAvg
                              ? "#3d9a6a"
                              : "#4a7a62"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <h3 className="chart-subtitle" style={{ marginTop: "1.25rem" }}>
                Detalhamento
              </h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Pagamento</th>
                      <th>Tipo</th>
                      <th>Referência</th>
                      <th className="num">R$ / cota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dividends.map((d, i) => (
                      <tr key={`${d.paymentDate}-${d.rate}-${i}`}>
                        <td>{formatDateBR(d.paymentDate)}</td>
                        <td>{d.label}</td>
                        <td>{d.relatedTo || "—"}</td>
                        <td className="num">{formatBRL(d.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {!loading && !error && data?.priceSignal && (
        <FiiAnalysisPanel
          tipo={data.resolvedTipo || meta.tipo}
          fundamentals={data.fundamentals ?? null}
          priceSignal={data.priceSignal}
          bolsaiConfigured={Boolean(data.providers?.bolsaiConfigured)}
        />
      )}
    </main>
  );
}
