import { formatBRL, formatPct } from "./allocation";
import { formatSignedPct } from "./quotes";

export const MASKED_BRL = "R$ ******";
export const MASKED_PCT = "****%";

export function formatBRLSensitive(value: number, visible: boolean): string {
  if (!visible) return MASKED_BRL;
  return formatBRL(value);
}

export function formatPctSensitive(weight: number, visible: boolean): string {
  if (!visible) return MASKED_PCT;
  return formatPct(weight);
}

export function formatSignedPctSensitive(
  pct: number | null | undefined,
  visible: boolean
): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  if (!visible) return MASKED_PCT;
  return formatSignedPct(pct);
}

export function formatNumberSensitive(
  value: number,
  visible: boolean,
  opts?: Intl.NumberFormatOptions
): string {
  if (!visible) return "******";
  return value.toLocaleString("pt-BR", opts);
}
