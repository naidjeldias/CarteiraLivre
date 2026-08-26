export interface TextChunk {
  id: string;
  disclosureId: string;
  ticker: string;
  text: string;
  index: number;
}

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;
const MAX_CHUNKS_PER_DOC = 6;

export function chunkDocument(ticker: string, disclosureId: string, text: string): TextChunk[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!clean) return [];
  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;
  while (start < clean.length && index < MAX_CHUNKS_PER_DOC) {
    const end = Math.min(clean.length, start + CHUNK_SIZE);
    let slice = clean.slice(start, end);
    if (end < clean.length) {
      const lastBreak = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(". "));
      if (lastBreak > CHUNK_SIZE * 0.6) slice = slice.slice(0, lastBreak + 1);
    }
    const body = slice.trim();
    if (body) {
      chunks.push({
        id: `${disclosureId}-${index}`,
        disclosureId,
        ticker,
        text: body,
        index,
      });
      index += 1;
    }
    if (end >= clean.length) break;
    start += Math.max(1, slice.length - CHUNK_OVERLAP);
  }
  return chunks;
}
