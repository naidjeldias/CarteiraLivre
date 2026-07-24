import type { FiiTipo } from "./types";

export interface ScoreBreakdownItem {
  id: string;
  label: string;
  weight: number;
  score: number | null; // 0–100 ou null se indisponível
  detail: string;
}

export interface PriceSignal {
  total: number | null; // 0–100, null se dados insuficientes
  label: "atrativo" | "neutro" | "cautela" | "insuficiente";
  summary: string;
  breakdown: ScoreBreakdownItem[];
  inputsUsed: string[];
  disclaimer: string;
}

/** DY típico de referência por tipo (aproximação de mercado). */
const PEER_DY: Record<FiiTipo, { low: number; mid: number; high: number }> = {
  papel: { low: 9, mid: 11, high: 14 },
  tijolo: { low: 6.5, mid: 8, high: 10 },
  hibrido: { low: 7.5, mid: 9, high: 11 },
  fof: { low: 7.5, mid: 9.5, high: 12 },
  desenvolvimento: { low: 0, mid: 4, high: 8 },
  desconhecido: { low: 7, mid: 9, high: 12 },
};

export interface ScoreInput {
  tipo: FiiTipo;
  pvp?: number | null;
  dividendYieldTtm?: number | null;
  /** Pagamentos mensais recentes (R$/cota), ordem cronológica. */
  monthlyDividends?: number[];
  vacancyPct?: number | null;
  delinquencyPct?: number | null;
  fiiHoldingsPct?: number | null;
  criPct?: number | null;
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function mean(xs: number[]) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** P/VP: melhor entre ~0.85–1.00; penaliza prêmio alto e desconto extremo. */
function scorePvp(pvp: number): { score: number; detail: string } {
  if (pvp <= 0) return { score: 0, detail: "P/VP inválido" };
  if (pvp < 0.7) {
    return {
      score: clamp(40 + (pvp - 0.5) * 50),
      detail: `P/VP ${pvp.toFixed(2)} — desconto profundo (verificar qualidade do VP)`,
    };
  }
  if (pvp < 0.85) {
    return {
      score: clamp(70 + (0.85 - pvp) * 80),
      detail: `P/VP ${pvp.toFixed(2)} — desconto atrativo vs patrimônio`,
    };
  }
  if (pvp <= 1.05) {
    return {
      score: clamp(85 - Math.abs(pvp - 0.95) * 100),
      detail: `P/VP ${pvp.toFixed(2)} — próximo do valor patrimonial`,
    };
  }
  if (pvp <= 1.2) {
    return {
      score: clamp(55 - (pvp - 1.05) * 150),
      detail: `P/VP ${pvp.toFixed(2)} — prêmio moderado sobre o VP`,
    };
  }
  return {
    score: clamp(25 - (pvp - 1.2) * 40),
    detail: `P/VP ${pvp.toFixed(2)} — prêmio elevado (caro vs patrimônio)`,
  };
}

/** DY vs faixa típica do tipo. */
function scoreDyVsPeer(dy: number, tipo: FiiTipo): { score: number; detail: string } {
  const peer = PEER_DY[tipo] || PEER_DY.desconhecido;
  if (dy < peer.low - 2) {
    return {
      score: clamp(35 + dy * 2),
      detail: `DY ${dy.toFixed(1)}% abaixo do típico de ${tipo} (~${peer.mid}%)`,
    };
  }
  if (dy > peer.high + 2) {
    return {
      score: clamp(45),
      detail: `DY ${dy.toFixed(1)}% muito acima do peer de ${tipo} — checar sustentabilidade`,
    };
  }
  // Sweet spot around mid
  const dist = Math.abs(dy - peer.mid);
  return {
    score: clamp(90 - dist * 8),
    detail: `DY ${dy.toFixed(1)}% vs referência ${tipo} ~${peer.low}–${peer.high}%`,
  };
}

/** Estabilidade dos proventos (menor CV = melhor). */
function scoreStability(monthly: number[]): { score: number | null; detail: string } {
  const last = monthly.slice(-12);
  if (last.length < 4) {
    return { score: null, detail: "Poucos meses de proventos para medir estabilidade" };
  }
  const m = mean(last);
  if (m <= 0) return { score: 20, detail: "Proventos médios nulos/negativos" };
  const cv = stdev(last) / m;
  if (cv < 0.08) return { score: 95, detail: `Proventos estáveis (CV ${(cv * 100).toFixed(0)}%)` };
  if (cv < 0.15) return { score: 80, detail: `Proventos regulares (CV ${(cv * 100).toFixed(0)}%)` };
  if (cv < 0.25) return { score: 60, detail: `Proventos voláteis (CV ${(cv * 100).toFixed(0)}%)` };
  return { score: 35, detail: `Proventos instáveis (CV ${(cv * 100).toFixed(0)}%)` };
}

/** Tendência: últimos 3m vs 3m anteriores. */
function scoreTrend(monthly: number[]): { score: number | null; detail: string } {
  if (monthly.length < 6) {
    return { score: null, detail: "Histórico curto para tendência" };
  }
  const recent = mean(monthly.slice(-3));
  const prev = mean(monthly.slice(-6, -3));
  if (prev <= 0) return { score: 50, detail: "Sem base anterior para tendência" };
  const change = (recent - prev) / prev;
  if (change >= 0.05) {
    return { score: 85, detail: `Renda recente +${(change * 100).toFixed(0)}% vs trimestre anterior` };
  }
  if (change >= -0.05) {
    return { score: 70, detail: `Renda estável vs trimestre anterior (${(change * 100).toFixed(0)}%)` };
  }
  if (change >= -0.15) {
    return { score: 45, detail: `Renda em queda ${(change * 100).toFixed(0)}% vs trimestre anterior` };
  }
  return { score: 25, detail: `Queda forte da renda (${(change * 100).toFixed(0)}%)` };
}

/** Vacância (tijolo) / inadimplência (papel). */
function scoreOperational(
  tipo: FiiTipo,
  vacancyPct?: number | null,
  delinquencyPct?: number | null
): { score: number | null; detail: string } {
  if (tipo === "tijolo" || tipo === "desenvolvimento") {
    if (vacancyPct == null) return { score: null, detail: "Vacância não disponível" };
    if (vacancyPct <= 5) return { score: 95, detail: `Vacância baixa (${vacancyPct.toFixed(1)}%)` };
    if (vacancyPct <= 10) return { score: 75, detail: `Vacância moderada (${vacancyPct.toFixed(1)}%)` };
    if (vacancyPct <= 15) return { score: 50, detail: `Vacância elevada (${vacancyPct.toFixed(1)}%)` };
    return { score: 25, detail: `Vacância alta (${vacancyPct.toFixed(1)}%)` };
  }
  if (tipo === "papel") {
    if (delinquencyPct == null) return { score: null, detail: "Inadimplência não disponível" };
    if (delinquencyPct <= 1) {
      return { score: 90, detail: `Inadimplência controlada (${delinquencyPct.toFixed(1)}%)` };
    }
    if (delinquencyPct <= 3) {
      return { score: 70, detail: `Inadimplência moderada (${delinquencyPct.toFixed(1)}%)` };
    }
    return { score: 35, detail: `Inadimplência preocupante (${delinquencyPct.toFixed(1)}%)` };
  }
  if (tipo === "fof" || tipo === "hibrido") {
    // Sem métrica operacional específica — neutro se não houver dados
    return { score: null, detail: "Métrica operacional específica não aplicável / indisponível" };
  }
  return { score: null, detail: "Sem métrica operacional" };
}

function labelFromTotal(total: number): PriceSignal["label"] {
  if (total >= 70) return "atrativo";
  if (total >= 40) return "neutro";
  return "cautela";
}

export function computePriceSignal(input: ScoreInput): PriceSignal {
  const disclaimer =
    "Sinal educacional com base em heurísticas. Não é recomendação de compra ou venda.";

  const items: ScoreBreakdownItem[] = [];
  const inputsUsed: string[] = [];

  // Pesos alvo
  const weights = {
    pvp: 30,
    dy: 25,
    stability: 20,
    trend: 10,
    operational: 15,
  };

  if (input.pvp != null && Number.isFinite(input.pvp)) {
    const r = scorePvp(input.pvp);
    items.push({
      id: "pvp",
      label: "P/VP vs patrimônio",
      weight: weights.pvp,
      score: r.score,
      detail: r.detail,
    });
    inputsUsed.push("pvp");
  } else {
    items.push({
      id: "pvp",
      label: "P/VP vs patrimônio",
      weight: weights.pvp,
      score: null,
      detail: "Indisponível — configure BOLSAI_API_KEY para P/VP",
    });
  }

  if (input.dividendYieldTtm != null && Number.isFinite(input.dividendYieldTtm)) {
    const r = scoreDyVsPeer(input.dividendYieldTtm, input.tipo);
    items.push({
      id: "dy",
      label: "DY vs peers do tipo",
      weight: weights.dy,
      score: r.score,
      detail: r.detail,
    });
    inputsUsed.push("dy");
  } else {
    items.push({
      id: "dy",
      label: "DY vs peers do tipo",
      weight: weights.dy,
      score: null,
      detail: "DY 12m indisponível",
    });
  }

  const stab = scoreStability(input.monthlyDividends || []);
  items.push({
    id: "stability",
    label: "Estabilidade dos proventos",
    weight: weights.stability,
    score: stab.score,
    detail: stab.detail,
  });
  if (stab.score != null) inputsUsed.push("dividends");

  const trend = scoreTrend(input.monthlyDividends || []);
  items.push({
    id: "trend",
    label: "Tendência da renda",
    weight: weights.trend,
    score: trend.score,
    detail: trend.detail,
  });
  if (trend.score != null) inputsUsed.push("trend");

  const op = scoreOperational(input.tipo, input.vacancyPct, input.delinquencyPct);
  items.push({
    id: "operational",
    label:
      input.tipo === "tijolo"
        ? "Vacância (tijolo)"
        : input.tipo === "papel"
          ? "Inadimplência (papel)"
          : "Operacional",
    weight: weights.operational,
    score: op.score,
    detail: op.detail,
  });
  if (op.score != null) inputsUsed.push("operational");

  const available = items.filter((i) => i.score != null);
  if (available.length < 2) {
    return {
      total: null,
      label: "insuficiente",
      summary: "Dados insuficientes para um sinal de preço confiável.",
      breakdown: items,
      inputsUsed,
      disclaimer,
    };
  }

  const weightSum = available.reduce((s, i) => s + i.weight, 0);
  const total = Math.round(
    available.reduce((s, i) => s + (i.score as number) * (i.weight / weightSum), 0)
  );
  const label = labelFromTotal(total);

  const summaries: Record<PriceSignal["label"], string> = {
    atrativo: "Sinais no conjunto apontam preço relativamente atrativo — valide qualidade e encaixe na carteira.",
    neutro: "Sinais mistos: preço nem claramente barato nem caro. Decisão depende do mandato e do risco.",
    cautela: "Sinais sugerem cautela: prêmio elevado, renda frágil ou risco operacional.",
    insuficiente: "Dados insuficientes.",
  };

  return {
    total,
    label,
    summary: summaries[label],
    breakdown: items,
    inputsUsed,
    disclaimer,
  };
}
