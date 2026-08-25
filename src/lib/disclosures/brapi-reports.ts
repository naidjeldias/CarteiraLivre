import { brapiHeaders, getBrapiToken } from "@/lib/brapi-server";
import { RELATORIO_TEXT_MONTHS, type FiiDisclosure } from "./types";
import { normalizeCnpj } from "./cnpj";
import crypto from "crypto";

function monthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function stableId(parts: string[]): string {
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

interface BrapiReport {
  referenceDate?: string;
  documentUrl?: string;
  url?: string;
  type?: string;
  description?: string;
  title?: string;
}

export async function fetchBrapiReports(ticker: string, cnpj?: string): Promise<FiiDisclosure[]> {
  const token = getBrapiToken();
  const url = new URL("https://brapi.dev/api/v2/fii/reports");
  url.searchParams.set("symbols", ticker);
  url.searchParams.set("sortBy", "referenceDate");
  url.searchParams.set("sortOrder", "desc");
  url.searchParams.set("limit", "8");
  const cutoff = monthsAgo(RELATORIO_TEXT_MONTHS);

  try {
    const headers: HeadersInit = token ? brapiHeaders(token) : {};
    const res = await fetch(url.toString(), { headers, cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as { reports?: BrapiReport[] };
    const reports = Array.isArray(json.reports) ? json.reports : [];
    const formatted = normalizeCnpj(cnpj);
    const items: FiiDisclosure[] = [];
    for (const r of reports) {
      const publishedAt = (r.referenceDate || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt) || publishedAt < cutoff) continue;
      const title = r.title || r.description || r.type || `Relatório ${publishedAt.slice(0, 7)}`;
      const link = r.documentUrl || r.url || "";
      items.push({
        id: stableId([ticker, "relatorio_gerencial", publishedAt, title, link]),
        ticker,
        cnpj: formatted,
        type: "relatorio_gerencial",
        title: String(title).slice(0, 180),
        publishedAt,
        source: "brapi",
        url: link || `https://brapi.dev/api/v2/fii/reports?symbols=${ticker}`,
        summary: r.description ? String(r.description).slice(0, 240) : undefined,
      });
    }
    return items;
  } catch {
    return [];
  }
}
