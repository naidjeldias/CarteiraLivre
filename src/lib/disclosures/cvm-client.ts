import fs from "fs";
import path from "path";
import crypto from "crypto";
import AdmZip from "adm-zip";
import { cnpjDigits, normalizeCnpj } from "./cnpj";
import { decodeCvmBuffer, filterCsvFileByCnpj, parseCvmCsv, pickField } from "./csv";
import { atomicWrite, cvmRawDir, ensureDir } from "./paths";
import {
  FATOS_DAYS,
  INFORMES_MENSAL_KEEP,
  INFORMES_TRIMESTRAL_KEEP,
  RAW_CACHE_TTL_HOURS,
  RELATORIO_TEXT_MONTHS,
  type DisclosureType,
  type FiiDisclosure,
} from "./types";

const CVM_EVENTUAL = "https://dados.cvm.gov.br/dados/FI/DOC/EVENTUAL/DADOS/eventual_fi_";
const CVM_MENSAL = "https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_";
const CVM_TRIMESTRAL = "https://dados.cvm.gov.br/dados/FII/DOC/INF_TRIMESTRAL/DADOS/inf_trimestral_fii_";

function yearsForDays(days: number): number[] {
  const now = new Date();
  const start = new Date(now.getTime() - days * 86400000);
  return [...new Set([now.getFullYear(), start.getFullYear()])].sort();
}

function isoDate(raw: string): string {
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const br = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return raw.trim().slice(0, 10);
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function monthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function stableId(parts: string[]): string {
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

function fundosnetSearchUrl(cnpj: string): string {
  const digits = cnpjDigits(cnpj) || cnpj.replace(/\D/g, "");
  return `https://fnet.bmfbovespa.com.br/fnet/publico/abrirGerenciadorDocumentosCVM?cnpjFundo=${digits}`;
}

function classifyEventual(tpDoc: string): DisclosureType | null {
  const n = tpDoc
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (n.includes("fato relev") || n === "fre") return "fato_relevante";
  if (n.includes("relat") && n.includes("gerenc")) return "relatorio_gerencial";
  return null;
}

function humanDocTitle(tpDoc: string, type: DisclosureType, date: string): string {
  const n = tpDoc
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (type === "fato_relevante" || n.includes("fato relev")) return `Fato relevante ${date}`;
  if (type === "relatorio_gerencial") return `Relatório gerencial ${date.slice(0, 7)}`;
  if (type === "informe_mensal") return `Informe mensal ${date.slice(0, 7)}`;
  if (type === "informe_trimestral") return `Informe trimestral ${date.slice(0, 7)}`;
  return (tpDoc || type).slice(0, 180);
}

function isFresh(filePath: string, ttlHours: number): boolean {
  try {
    const st = fs.statSync(filePath);
    return Date.now() - st.mtimeMs < ttlHours * 3600 * 1000 && st.size > 0;
  } catch {
    return false;
  }
}

async function downloadCached(url: string, destName: string): Promise<string> {
  ensureDir(cvmRawDir());
  const dest = path.join(cvmRawDir(), destName);
  if (isFresh(dest, RAW_CACHE_TTL_HOURS)) return dest;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "CarteiraLivre/0.1 (CVM dados abertos)" },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) throw new Error(`CVM ${res.status} em ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  atomicWrite(dest, buf);
  return dest;
}

function rowToDisclosure(
  ticker: string,
  cnpj: string,
  row: Record<string, string>,
  type: DisclosureType,
  title: string,
  dateRaw: string,
  url: string,
  summary?: string
): FiiDisclosure | null {
  const publishedAt = isoDate(dateRaw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) return null;
  const idDoc = pickField(row, ["ID_DOC", "id_doc", "NR_PROTOCOLO"]);
  return {
    id: stableId([ticker, type, publishedAt, title, idDoc || url]),
    ticker,
    cnpj,
    type,
    title,
    publishedAt,
    source: "cvm",
    url: url || fundosnetSearchUrl(cnpj),
    summary,
  };
}

function keepNewest(items: FiiDisclosure[], n: number): FiiDisclosure[] {
  return [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, n);
}

function structuredSummary(row: Record<string, string>, interesting: string[]): string {
  const parts: string[] = [];
  for (const key of Object.keys(row)) {
    const val = row[key]?.trim();
    if (!val || val === "0" || val === "0,00") continue;
    const match = interesting.find((k) => key.toLowerCase().includes(k.toLowerCase()));
    if (match) parts.push(`${key}: ${val}`);
  }
  return parts.slice(0, 12).join(" · ");
}

export async function fetchCvmEventuais(ticker: string, cnpj: string): Promise<FiiDisclosure[]> {
  const digits = cnpjDigits(cnpj);
  if (!digits) return [];
  const formatted = normalizeCnpj(cnpj) || cnpj;
  const cutoffFatos = daysAgo(FATOS_DAYS);
  const cutoffRel = monthsAgo(RELATORIO_TEXT_MONTHS);
  const items: FiiDisclosure[] = [];

  for (const year of yearsForDays(FATOS_DAYS)) {
    const file = await downloadCached(`${CVM_EVENTUAL}${year}.csv`, `eventual_fi_${year}.csv`);
    const rows = await filterCsvFileByCnpj(file, digits);
    for (const row of rows) {
      const tp = pickField(row, ["TP_DOC", "TP_DOCUMENTO", "TIPO"]);
      const type = classifyEventual(tp);
      if (!type) continue;
      const date = pickField(row, ["DT_RECEB", "DT_COMPTC", "DT_REFER"]);
      const publishedAt = isoDate(date);
      if (type === "fato_relevante" && publishedAt < cutoffFatos) continue;
      if (type === "relatorio_gerencial" && publishedAt < cutoffRel) continue;
      const title = humanDocTitle(tp, type, publishedAt);
      const url = pickField(row, ["LINK_ARQ", "LINK", "URL"]);
      const fileName = pickField(row, ["NM_ARQ"]);
      const item = rowToDisclosure(
        ticker,
        formatted,
        row,
        type,
        title,
        date,
        url,
        fileName && fileName !== title ? fileName.slice(0, 240) : undefined
      );
      if (item) items.push(item);
    }
  }
  return items;
}

function readZipCsv(zipPath: string, nameIncludes: string[]): Record<string, string>[] {
  const zip = new AdmZip(zipPath);
  const entry = zip.getEntries().find((e) => {
    const n = e.entryName.toLowerCase();
    return nameIncludes.every((part) => n.includes(part.toLowerCase())) && n.endsWith(".csv");
  });
  if (!entry) return [];
  return parseCvmCsv(decodeCvmBuffer(entry.getData()));
}

function filterRowsByCnpj(rows: Record<string, string>[], digits: string): Record<string, string>[] {
  return rows.filter((row) => {
    const raw = pickField(row, ["CNPJ_Fundo", "CNPJ_FUNDO", "CNPJ_FUNDO_CLASSE", "CNPJ"]);
    return cnpjDigits(raw) === digits;
  });
}

export async function fetchCvmInformesMensais(ticker: string, cnpj: string): Promise<FiiDisclosure[]> {
  const digits = cnpjDigits(cnpj);
  if (!digits) return [];
  const formatted = normalizeCnpj(cnpj) || cnpj;
  const items: FiiDisclosure[] = [];

  for (const year of yearsForDays(200)) {
    try {
      const zipPath = await downloadCached(`${CVM_MENSAL}${year}.zip`, `inf_mensal_fii_${year}.zip`);
      const geral = filterRowsByCnpj(readZipCsv(zipPath, ["geral"]), digits);
      const complemento = filterRowsByCnpj(readZipCsv(zipPath, ["complemento"]), digits);
      const extraByDate = new Map<string, Record<string, string>>();
      for (const row of complemento) {
        extraByDate.set(isoDate(pickField(row, ["Data_Referencia", "DT_COMPTC", "DT_REFER"])), row);
      }
      for (const row of geral) {
        const date = pickField(row, ["Data_Referencia", "DT_COMPTC", "DT_REFER"]);
        const extra = extraByDate.get(isoDate(date)) || {};
        const merged = { ...extra, ...row };
        const summary = structuredSummary(merged, [
          "vacancia",
          "inadimpl",
          "patrimonio",
          "aluguel",
          "receita",
          "cota",
          "dividend",
          "num_cotista",
        ]);
        const item = rowToDisclosure(
          ticker,
          formatted,
          merged,
          "informe_mensal",
          `Informe mensal ${isoDate(date).slice(0, 7)}`,
          date,
          fundosnetSearchUrl(formatted),
          summary || undefined
        );
        if (item) items.push(item);
      }
    } catch {
      /* year zip may be missing */
    }
  }
  return keepNewest(items, INFORMES_MENSAL_KEEP);
}

export async function fetchCvmInformesTrimestrais(ticker: string, cnpj: string): Promise<FiiDisclosure[]> {
  const digits = cnpjDigits(cnpj);
  if (!digits) return [];
  const formatted = normalizeCnpj(cnpj) || cnpj;
  const items: FiiDisclosure[] = [];
  const nowYear = new Date().getFullYear();

  for (const year of [nowYear, nowYear - 1]) {
    try {
      const zipPath = await downloadCached(`${CVM_TRIMESTRAL}${year}.zip`, `inf_trimestral_fii_${year}.zip`);
      const geral = filterRowsByCnpj(readZipCsv(zipPath, ["geral"]), digits);
      for (const row of geral) {
        const date = pickField(row, ["Data_Referencia", "DT_COMPTC", "DT_REFER"]);
        const summary = structuredSummary(row, [
          "vacancia",
          "inadimpl",
          "patrimonio",
          "receita",
          "cota",
          "area",
        ]);
        const item = rowToDisclosure(
          ticker,
          formatted,
          row,
          "informe_trimestral",
          `Informe trimestral ${isoDate(date).slice(0, 7)}`,
          date,
          fundosnetSearchUrl(formatted),
          summary || undefined
        );
        if (item) items.push(item);
      }
    } catch {
      /* year zip may be missing */
    }
  }
  return keepNewest(items, INFORMES_TRIMESTRAL_KEEP);
}

export function structuredTextFromDisclosure(item: FiiDisclosure): string | null {
  if (!item.summary) return null;
  if (item.type !== "informe_mensal" && item.type !== "informe_trimestral") return null;
  return `${item.title} (${item.publishedAt})\n${item.summary}`;
}
