import fs from "fs";
import { listDisclosures, listStoredTexts } from "@/lib/disclosures/store";
import { atomicWrite, ragChunksPath } from "@/lib/disclosures/paths";
import { chunkDocument, type TextChunk } from "./chunk";
import { cosineSimilarity, embedTexts } from "./embed";

export interface StoredChunk extends TextChunk {
  title?: string;
  publishedAt?: string;
  url?: string;
  embedding?: number[];
}

export interface SearchHit {
  ticker: string;
  disclosureId: string;
  title?: string;
  publishedAt?: string;
  url?: string;
  text: string;
  score: number;
}

function readChunks(ticker: string): StoredChunk[] {
  try {
    const raw = fs.readFileSync(ragChunksPath(ticker), "utf8");
    const parsed = JSON.parse(raw) as { chunks?: StoredChunk[] };
    return Array.isArray(parsed.chunks) ? parsed.chunks : [];
  } catch {
    return [];
  }
}

function writeChunks(ticker: string, chunks: StoredChunk[]): void {
  atomicWrite(ragChunksPath(ticker), JSON.stringify({ ticker, updatedAt: new Date().toISOString(), chunks }, null, 0));
}

export async function indexTickerDocuments(ticker: string): Promise<number> {
  const key = ticker.toUpperCase();
  const docs = listStoredTexts(key);
  const meta = new Map(listDisclosures(key).map((d) => [d.id, d]));
  const chunks: StoredChunk[] = [];
  for (const doc of docs) {
    const disclosure = meta.get(doc.id);
    const parts = chunkDocument(key, doc.id, doc.text);
    for (const part of parts) {
      chunks.push({
        ...part,
        title: disclosure?.title,
        publishedAt: disclosure?.publishedAt,
        url: disclosure?.url,
      });
    }
  }
  if (chunks.length === 0) {
    writeChunks(key, []);
    return 0;
  }
  const vectors = await embedTexts(chunks.map((c) => c.text));
  if (vectors) {
    chunks.forEach((c, i) => {
      c.embedding = vectors[i];
    });
  }
  writeChunks(key, chunks);
  return chunks.length;
}

function keywordScore(query: string, text: string): number {
  const terms = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\W+/)
    .filter((t) => t.length > 2);
  if (!terms.length) return 0;
  const hay = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  let hits = 0;
  for (const t of terms) if (hay.includes(t)) hits += 1;
  return hits / terms.length;
}

export async function searchFiiDocuments(
  ticker: string,
  query: string,
  topK = 5
): Promise<SearchHit[]> {
  const key = ticker.toUpperCase();
  let chunks = readChunks(key);
  if (chunks.length === 0) {
    await indexTickerDocuments(key);
    chunks = readChunks(key);
  }
  if (chunks.length === 0) return [];

  const k = Math.min(10, Math.max(1, Math.round(topK) || 5));
  const queryVecs = await embedTexts([query]);
  const qv = queryVecs?.[0];

  const scored = chunks.map((c) => {
    const semantic = qv && c.embedding ? cosineSimilarity(qv, c.embedding) : 0;
    const kw = keywordScore(query, c.text);
    return {
      ticker: key,
      disclosureId: c.disclosureId,
      title: c.title,
      publishedAt: c.publishedAt,
      url: c.url,
      text: c.text,
      score: semantic > 0 ? semantic * 0.8 + kw * 0.2 : kw,
    };
  });

  return scored
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
