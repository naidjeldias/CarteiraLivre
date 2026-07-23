import type { PortfolioSnapshot } from "./types";

const SNAPSHOT_KEY = "carteiralivre.snapshot.v1";

export function savePortfolioSnapshot(snapshot: PortfolioSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // quota / private mode — ignore
  }
}

export function loadPortfolioSnapshot(): PortfolioSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortfolioSnapshot;
    if (!parsed?.positions || !Array.isArray(parsed.positions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPortfolioSnapshot(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SNAPSHOT_KEY);
}
