import { createGeminiClient, isGeminiConfigured } from "@/lib/agent/gemini";

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMS = 768;

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!isGeminiConfigured() || texts.length === 0) return null;
  const ai = createGeminiClient();
  const out: number[][] = [];
  const batchSize = 16;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: batch,
      config: { outputDimensionality: EMBEDDING_DIMS },
    });
    const embeddings = res.embeddings ?? [];
    for (const emb of embeddings) {
      if (emb.values?.length) out.push(emb.values);
    }
  }
  return out.length === texts.length ? out : null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
