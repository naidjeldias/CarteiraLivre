import {
  FATOS_DAYS,
  INFORMES_MENSAL_KEEP,
  INFORMES_TRIMESTRAL_KEEP,
  MAX_EXTRACT_PER_SYNC,
  RELATORIO_TEXT_MONTHS,
  SYNC_TTL_HOURS,
  type FiiDisclosure,
  type TickerIndex,
} from "./types";
import { resolveCnpj } from "./cnpj";
import {
  fetchCvmEventuais,
  fetchCvmInformesMensais,
  fetchCvmInformesTrimestrais,
  structuredTextFromDisclosure,
} from "./cvm-client";
import { fetchBrapiReports } from "./brapi-reports";
import { extractFromUrl } from "./extract";
import {
  deleteDocumentText,
  isIndexStale,
  pruneOrphanTexts,
  readDocumentText,
  readTickerIndex,
  writeDocumentText,
  writeTickerIndex,
} from "./store";
import { isGeminiConfigured } from "@/lib/agent/gemini";

export interface SyncTickerResult {
  ticker: string;
  cnpj?: string;
  syncedAt: string;
  count: number;
  skipped?: boolean;
  syncError?: string | null;
  disclosures: FiiDisclosure[];
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function monthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function pruneRetention(items: FiiDisclosure[]): FiiDisclosure[] {
  const fatoCut = daysAgo(FATOS_DAYS);
  const relCut = monthsAgo(RELATORIO_TEXT_MONTHS);
  const fatos = items
    .filter((i) => i.type === "fato_relevante" && i.publishedAt >= fatoCut)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const relatorios = items
    .filter((i) => i.type === "relatorio_gerencial" && i.publishedAt >= relCut)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const mensais = items
    .filter((i) => i.type === "informe_mensal")
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, INFORMES_MENSAL_KEEP);
  const trimestrais = items
    .filter((i) => i.type === "informe_trimestral")
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, INFORMES_TRIMESTRAL_KEEP);
  const outros = items
    .filter((i) => i.type === "outro" && i.publishedAt >= fatoCut)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 10);
  const merged = [...fatos, ...relatorios, ...mensais, ...trimestrais, ...outros];
  const seen = new Set<string>();
  return merged.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function mergeDisclosures(groups: FiiDisclosure[][]): FiiDisclosure[] {
  const byKey = new Map<string, FiiDisclosure>();
  for (const group of groups) {
    for (const item of group) {
      const key = `${item.type}|${item.publishedAt}|${item.title.toLowerCase()}`;
      const prev = byKey.get(key) || byKey.get(item.id);
      if (!prev) {
        byKey.set(key, item);
        continue;
      }
      const betterUrl = /^https?:/i.test(item.url) && item.url.includes("download") && !prev.url.includes("download");
      if (betterUrl || (!prev.summary && item.summary)) {
        byKey.set(key, { ...prev, ...item, id: prev.id, url: betterUrl ? item.url : prev.url });
      }
    }
  }
  return [...byKey.values()];
}

async function extractTexts(ticker: string, items: FiiDisclosure[]): Promise<void> {
  const prefer = items
    .filter((i) => i.type === "relatorio_gerencial" || i.type === "fato_relevante")
    .concat(items.filter((i) => i.type === "informe_mensal" || i.type === "informe_trimestral"));

  let extracted = 0;
  for (const item of prefer) {
    const existing = readDocumentText(ticker, item.id);
    if (existing) continue;

    const structured = structuredTextFromDisclosure(item);
    if (structured) {
      writeDocumentText({
        disclosureId: item.id,
        ticker,
        text: structured,
        fetchedAt: new Date().toISOString(),
        charCount: structured.length,
      });
    }

    if (extracted >= MAX_EXTRACT_PER_SYNC) continue;
    if (!/^https?:/i.test(item.url)) continue;
    if (item.url.includes("abrirGerenciadorDocumentosCVM") && !item.url.match(/download|id=/i)) {
      continue;
    }
    const text = await extractFromUrl(item.url);
    if (!text) continue;
    writeDocumentText({
      disclosureId: item.id,
      ticker,
      text,
      fetchedAt: new Date().toISOString(),
      charCount: text.length,
    });
    extracted += 1;
  }
}

export async function syncTicker(ticker: string, opts?: { force?: boolean }): Promise<SyncTickerResult> {
  const key = ticker.trim().toUpperCase();
  const existing = readTickerIndex(key);
  if (!opts?.force && existing && !isIndexStale(existing, SYNC_TTL_HOURS)) {
    return {
      ticker: key,
      cnpj: existing.cnpj,
      syncedAt: existing.syncedAt,
      count: existing.disclosures.length,
      skipped: true,
      syncError: existing.syncError ?? null,
      disclosures: existing.disclosures,
    };
  }

  const errors: string[] = [];
  const cnpj = await resolveCnpj(key);
  if (!cnpj) {
    const syncedAt = new Date().toISOString();
    const index: TickerIndex = {
      ticker: key,
      syncedAt,
      syncError: "CNPJ do fundo não encontrado. Sem CNPJ não dá para cruzar os dados da CVM.",
      disclosures: existing?.disclosures ?? [],
    };
    writeTickerIndex(index);
    return {
      ticker: key,
      syncedAt,
      count: index.disclosures.length,
      syncError: index.syncError,
      disclosures: index.disclosures,
    };
  }

  let eventuais: FiiDisclosure[] = [];
  let mensais: FiiDisclosure[] = [];
  let trimestrais: FiiDisclosure[] = [];
  let reports: FiiDisclosure[] = [];

  try {
    eventuais = await fetchCvmEventuais(key, cnpj);
  } catch (e) {
    errors.push(`CVM eventuais: ${e instanceof Error ? e.message : "falha"}`);
  }
  try {
    mensais = await fetchCvmInformesMensais(key, cnpj);
  } catch (e) {
    errors.push(`CVM informes mensais: ${e instanceof Error ? e.message : "falha"}`);
  }
  try {
    trimestrais = await fetchCvmInformesTrimestrais(key, cnpj);
  } catch (e) {
    errors.push(`CVM informes trimestrais: ${e instanceof Error ? e.message : "falha"}`);
  }
  try {
    reports = await fetchBrapiReports(key, cnpj);
  } catch {
    /* optional */
  }

  const disclosures = pruneRetention(mergeDisclosures([eventuais, mensais, trimestrais, reports])).sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  );

  const syncedAt = new Date().toISOString();
  writeTickerIndex({
    ticker: key,
    cnpj,
    syncedAt,
    syncError: errors.length ? errors.join(" · ") : null,
    disclosures,
  });

  await extractTexts(key, disclosures);

  const keepIds = new Set(disclosures.map((d) => d.id));
  if (existing) {
    for (const old of existing.disclosures) {
      if (!keepIds.has(old.id)) deleteDocumentText(key, old.id);
    }
  }
  pruneOrphanTexts(key, keepIds);

  if (isGeminiConfigured()) {
    try {
      const { indexTickerDocuments } = await import("@/lib/rag/search");
      await indexTickerDocuments(key);
    } catch (e) {
      errors.push(`RAG: ${e instanceof Error ? e.message : "falha ao indexar"}`);
    }
  }

  const finishedAt = new Date().toISOString();
  const syncError = errors.length ? errors.join(" · ") : null;
  const index: TickerIndex = { ticker: key, cnpj, syncedAt: finishedAt, syncError, disclosures };
  writeTickerIndex(index);

  return { ticker: key, cnpj, syncedAt: finishedAt, count: disclosures.length, syncError, disclosures };
}
