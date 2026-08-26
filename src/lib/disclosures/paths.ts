import fs from "fs";
import path from "path";

export function getDataDir(): string {
  const fromEnv = process.env.DATA_DIR?.trim();
  if (fromEnv) return fromEnv;
  if (fs.existsSync("/app/data")) return "/app/data";
  return path.join(process.cwd(), "data");
}

export function disclosuresDir(ticker?: string): string {
  const base = path.join(getDataDir(), "disclosures");
  return ticker ? path.join(base, ticker.toUpperCase()) : base;
}

export function ragDir(ticker?: string): string {
  const base = path.join(getDataDir(), "rag");
  return ticker ? path.join(base, ticker.toUpperCase()) : base;
}

export function cvmRawDir(): string {
  return path.join(getDataDir(), "cvm-raw");
}

export function cnpjMapPath(): string {
  return path.join(getDataDir(), "cnpj-map.json");
}

export function tickerIndexPath(ticker: string): string {
  return path.join(disclosuresDir(ticker), "index.json");
}

export function tickerTextPath(ticker: string, id: string): string {
  return path.join(disclosuresDir(ticker), "text", `${id}.txt`);
}

export function tickerSummaryPath(ticker: string): string {
  return path.join(disclosuresDir(ticker), "summary.json");
}

export function ragChunksPath(ticker: string): string {
  return path.join(ragDir(ticker), "chunks.json");
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function atomicWrite(filePath: string, contents: string | Buffer): void {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
}
