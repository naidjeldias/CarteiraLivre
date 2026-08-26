import {
  allocationByAssetClass,
  allocationByFiiTipo,
  totalValue,
  type AllocationSlice,
} from "@/lib/allocation";
import { lookupFii } from "@/lib/fii-catalog";
import type { AssetClass, FiiSegmento, FiiTipo, PortfolioSnapshot, Position } from "@/lib/types";

export const MAX_SUMMARY_POSITIONS = 80;

export interface SummaryPosition {
  ticker: string;
  name?: string;
  quantity: number;
  price: number;
  value: number;
  assetClass: AssetClass;
  tipo?: FiiTipo;
  segmento?: FiiSegmento;
}

export interface PortfolioSummary {
  importedAt: string;
  sourceFileName: string;
  positionCount: number;
  totalValue: number;
  positions: SummaryPosition[];
  allocationByAssetClass: AllocationSlice[];
  allocationByFiiTipo: AllocationSlice[];
}

function toSummaryPosition(p: Position): SummaryPosition {
  const row: SummaryPosition = {
    ticker: p.ticker,
    quantity: p.quantity,
    price: p.price,
    value: p.value,
    assetClass: p.assetClass,
  };
  if (p.name) row.name = p.name;

  const meta = lookupFii(p.ticker);
  if (p.assetClass === "fii" || meta.tipo !== "desconhecido") {
    row.tipo = meta.tipo;
    row.segmento = meta.segmento;
    if (!row.name && meta.name) row.name = meta.name;
  }
  return row;
}

/** Empty summary when the user has not imported a portfolio (e.g. direct FII page visit). */
export function emptyPortfolioSummary(): PortfolioSummary {
  return {
    importedAt: new Date().toISOString(),
    sourceFileName: "(sem carteira importada)",
    positionCount: 0,
    totalValue: 0,
    positions: [],
    allocationByAssetClass: [],
    allocationByFiiTipo: [],
  };
}

/** Compact JSON-safe view of the snapshot. Safe to call in the browser. */
export function buildPortfolioSummary(snapshot: PortfolioSnapshot): PortfolioSummary {
  const positions = [...snapshot.positions]
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_SUMMARY_POSITIONS)
    .map(toSummaryPosition);

  return {
    importedAt: snapshot.importedAt,
    sourceFileName: snapshot.sourceFileName,
    positionCount: snapshot.positions.length,
    totalValue: totalValue(snapshot.positions),
    positions,
    allocationByAssetClass: allocationByAssetClass(snapshot),
    allocationByFiiTipo: allocationByFiiTipo(snapshot),
  };
}

/** Rebuild a snapshot for allocation helpers. Broker is never included. */
export function snapshotFromSummary(summary: PortfolioSummary): PortfolioSnapshot {
  return {
    importedAt: summary.importedAt,
    sourceFileName: summary.sourceFileName,
    positions: summary.positions.map((p) => ({
      ticker: p.ticker,
      name: p.name,
      quantity: p.quantity,
      price: p.price,
      value: p.value,
      assetClass: p.assetClass,
    })),
  };
}
