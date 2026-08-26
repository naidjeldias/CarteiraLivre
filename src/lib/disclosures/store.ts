import fs from "fs";
import {
  SUMMARY_CACHE_HOURS,
  SYNC_TTL_HOURS,
  type CachedSummary,
  type FiiDisclosure,
  type StoredDocument,
  type TickerIndex,
} from "./types";
import {
  atomicWrite,
  disclosuresDir,
  tickerIndexPath,
  tickerSummaryPath,
  tickerTextPath,
} from "./paths";

export function readTickerIndex(ticker: string): TickerIndex | null {
  try {
    const raw = fs.readFileSync(tickerIndexPath(ticker), "utf8");
    const parsed = JSON.parse(raw) as TickerIndex;
    if (!parsed || !Array.isArray(parsed.disclosures)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeTickerIndex(index: TickerIndex): void {
  atomicWrite(tickerIndexPath(index.ticker), JSON.stringify(index, null, 2));
}

export function isIndexStale(index: TickerIndex | null, ttlHours = SYNC_TTL_HOURS): boolean {
  if (!index?.syncedAt) return true;
  const ts = Date.parse(index.syncedAt);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > ttlHours * 3600 * 1000;
}

export function listDisclosures(ticker: string): FiiDisclosure[] {
  const index = readTickerIndex(ticker);
  if (!index) return [];
  return [...index.disclosures].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function writeDocumentText(doc: StoredDocument): void {
  atomicWrite(tickerTextPath(doc.ticker, doc.disclosureId), doc.text);
}

export function readDocumentText(ticker: string, disclosureId: string): string | null {
  try {
    return fs.readFileSync(tickerTextPath(ticker, disclosureId), "utf8");
  } catch {
    return null;
  }
}

export function deleteDocumentText(ticker: string, disclosureId: string): void {
  try {
    fs.unlinkSync(tickerTextPath(ticker, disclosureId));
  } catch {
    /* ignore */
  }
}

export function listStoredTexts(ticker: string): Array<{ id: string; text: string }> {
  const index = readTickerIndex(ticker);
  if (!index) return [];
  const out: Array<{ id: string; text: string }> = [];
  for (const item of index.disclosures) {
    const text = readDocumentText(ticker, item.id);
    if (text && text.trim()) out.push({ id: item.id, text });
  }
  return out;
}

export function readCachedSummary(ticker: string): CachedSummary | null {
  try {
    const raw = fs.readFileSync(tickerSummaryPath(ticker), "utf8");
    const parsed = JSON.parse(raw) as CachedSummary;
    if (!parsed?.markdown || !parsed.generatedAt) return null;
    const ts = Date.parse(parsed.generatedAt);
    if (!Number.isFinite(ts)) return null;
    if (Date.now() - ts > SUMMARY_CACHE_HOURS * 3600 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedSummary(summary: CachedSummary): void {
  atomicWrite(tickerSummaryPath(summary.ticker), JSON.stringify(summary, null, 2));
}

export function pruneOrphanTexts(ticker: string, keepIds: Set<string>): void {
  const dir = `${disclosuresDir(ticker)}/text`;
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.endsWith(".txt")) continue;
    const id = name.slice(0, -4);
    if (!keepIds.has(id)) {
      try {
        fs.unlinkSync(`${dir}/${name}`);
      } catch {
        /* ignore */
      }
    }
  }
}
