import fs from "fs";
import readline from "readline";

export function decodeCvmBuffer(buf: Buffer): string {
  return buf.toString("latin1");
}

export function splitCvmLine(line: string): string[] {
  return line.replace(/\r$/, "").split(";");
}

export function parseCvmCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCvmLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCvmLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

export function pickField(row: Record<string, string>, names: string[]): string {
  const keys = Object.keys(row);
  for (const name of names) {
    const exact = row[name];
    if (exact) return exact;
    const found = keys.find((k) => k.toLowerCase() === name.toLowerCase());
    if (found && row[found]) return row[found];
  }
  return "";
}

export async function filterCsvFileByCnpj(
  filePath: string,
  cnpjDigitsWanted: string
): Promise<Record<string, string>[]> {
  const stream = fs.createReadStream(filePath, { encoding: "latin1" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers: string[] = [];
  const cnpjIdxCandidates: number[] = [];
  const rows: Record<string, string>[] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (headers.length === 0) {
      headers = splitCvmLine(line).map((h) => h.trim());
      headers.forEach((h, i) => {
        const n = h.toLowerCase();
        if (n.includes("cnpj")) cnpjIdxCandidates.push(i);
      });
      continue;
    }
    const cols = splitCvmLine(line);
    const matches = cnpjIdxCandidates.some((i) => {
      const digits = (cols[i] || "").replace(/\D/g, "");
      return digits === cnpjDigitsWanted;
    });
    if (!matches) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}
