import { lookupFii } from "./fii-catalog";
import type { FiiTipo, PortfolioSnapshot, Position } from "./types";

export function totalValue(positions: Position[]): number {
  return positions.reduce((sum, p) => sum + p.value, 0);
}

export function filterFiis(positions: Position[]): Position[] {
  return positions.filter(
    (p) =>
      p.ticker.endsWith("11") &&
      (p.assetClass === "fii" || lookupFii(p.ticker).tipo !== "desconhecido")
  );
}

export interface AllocationSlice {
  key: string;
  value: number;
  weight: number;
}

export function allocationByAssetClass(snapshot: PortfolioSnapshot): AllocationSlice[] {
  const total = totalValue(snapshot.positions) || 1;
  const map = new Map<string, number>();
  for (const p of snapshot.positions) {
    map.set(p.assetClass, (map.get(p.assetClass) ?? 0) + p.value);
  }
  return [...map.entries()]
    .map(([key, value]) => ({ key, value, weight: value / total }))
    .sort((a, b) => b.value - a.value);
}

export function allocationByFiiTipo(snapshot: PortfolioSnapshot): AllocationSlice[] {
  const fiis = filterFiis(snapshot.positions);
  const total = totalValue(fiis) || 1;
  const map = new Map<FiiTipo | string, number>();
  for (const p of fiis) {
    const tipo = lookupFii(p.ticker).tipo;
    map.set(tipo, (map.get(tipo) ?? 0) + p.value);
  }
  return [...map.entries()]
    .map(([key, value]) => ({ key, value, weight: value / total }))
    .sort((a, b) => b.value - a.value);
}

export function allocationByFiiSegmento(snapshot: PortfolioSnapshot): AllocationSlice[] {
  const fiis = filterFiis(snapshot.positions);
  const total = totalValue(fiis) || 1;
  const map = new Map<string, number>();
  for (const p of fiis) {
    const segmento = lookupFii(p.ticker).segmento;
    map.set(segmento, (map.get(segmento) ?? 0) + p.value);
  }
  return [...map.entries()]
    .map(([key, value]) => ({ key, value, weight: value / total }))
    .sort((a, b) => b.value - a.value);
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatPct(weight: number): string {
  return (weight * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + "%";
}
