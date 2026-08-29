export type ChartRangeId = "5d" | "1mo" | "ytd" | "1y" | "5y";

export interface ChartRangeOption {
  id: ChartRangeId;
  label: string;
  brapiRange: string;
}

export const CHART_RANGES: ChartRangeOption[] = [
  { id: "5d", label: "5 Dias", brapiRange: "5d" },
  { id: "1mo", label: "1 Mês", brapiRange: "1mo" },
  { id: "ytd", label: "YTD", brapiRange: "ytd" },
  { id: "1y", label: "1 Ano", brapiRange: "1y" },
  { id: "5y", label: "5 Anos", brapiRange: "5y" },
];

export const DEFAULT_PRICE_CHART_RANGE: ChartRangeId = "1mo";
export const DEFAULT_DIVIDEND_CHART_RANGE: ChartRangeId = "1y";

/** Fallback for price/history API when range is omitted. */
export const DEFAULT_CHART_RANGE: ChartRangeId = DEFAULT_PRICE_CHART_RANGE;

export function chartRangeLabel(id: ChartRangeId): string {
  return CHART_RANGES.find((r) => r.id === id)?.label ?? id;
}

export function brapiRangeFor(id: ChartRangeId): string {
  return CHART_RANGES.find((r) => r.id === id)?.brapiRange ?? "1mo";
}

/** ISO date (YYYY-MM-DD) inclusive lower bound for client-side filtering. */
export function chartRangeStartDate(id: ChartRangeId, now = new Date()): string {
  const d = new Date(now);
  switch (id) {
    case "5d":
      d.setDate(d.getDate() - 5);
      break;
    case "1mo":
      d.setMonth(d.getMonth() - 1);
      break;
    case "ytd":
      return `${now.getFullYear()}-01-01`;
    case "1y":
      d.setFullYear(d.getFullYear() - 1);
      break;
    case "5y":
      d.setFullYear(d.getFullYear() - 5);
      break;
  }
  return d.toISOString().slice(0, 10);
}

export function isOnOrAfter(isoDate: string, startDate: string): boolean {
  return isoDate.slice(0, 10) >= startDate;
}
