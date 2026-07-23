import * as XLSX from "xlsx";
import type { AssetClass, Position, PortfolioSnapshot } from "./types";

/** Headers preferidos (já normalizados, sem acento). Mais específico primeiro. */
const COLS = {
  ticker: ["codigo de negociacao", "cod de negociacao", "ticker"],
  product: ["produto", "ativo", "nome", "descricao"],
  quantity: ["quantidade disponivel", "quantidade", "qtde", "qtd"],
  price: [
    "preco de fechamento",
    "preco atualizado mtm",
    "preco atualizado curva",
    "preco atual",
    "cotacao",
    "preco",
  ],
  value: [
    "valor atualizado mtm",
    "valor atualizado curva",
    "valor atualizado",
    "valor de mercado",
    "valor atual",
    "valor bruto",
    "saldo",
  ],
  broker: ["instituicao", "corretora"],
};

const KNOWN_ETFS = new Set([
  "BOVA11",
  "IVVB11",
  "SMAL11",
  "HASH11",
  "NASD11",
  "EURP11",
  "XINA11",
  "GOLD11",
  "ACWI11",
  "MATB11",
  "PIBB11",
  "FIND11",
  "ISUS11",
  "GOVE11",
  "BREW11",
  "SPXI11",
]);

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[./]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Escolhe a coluna pelo match mais específico (evita "Produto" ou "Código ISIN"). */
function findBestColumn(headers: string[], candidates: string[]): number {
  let bestIdx = -1;
  let bestScore = -1;
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    for (const candidate of candidates) {
      if (h === candidate) return i;
      if (h.includes(candidate)) {
        const score = candidate.length * 10 - (h.length - candidate.length);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
    }
  }
  return bestIdx;
}

function parseNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || value === "") return 0;
  const raw = String(value).trim();
  if (!raw || raw === "-") return 0;
  const cleaned = raw.replace(/R\$\s*/gi, "").replace(/\s/g, "");
  if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(cleaned) || /^-?\d+,\d+$/.test(cleaned)) {
    return Number(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return Number(cleaned.replace(/[^\d.-]/g, "")) || 0;
}

/** Extrai ticker B3 de "KNCR11 - KINEA..." ou "KNCR11". */
export function extractTicker(raw: string): string | null {
  const text = String(raw ?? "").trim().toUpperCase();
  if (!text) return null;
  const match = text.match(/\b([A-Z]{4}\d{1,2}[A-Z]?)\b/);
  if (!match) return null;
  // Remove sufixo de direito (L) mantendo recibos 12–18
  return match[1].replace(/L$/, "");
}

export function extractProductName(raw: string): string | undefined {
  const text = String(raw ?? "").trim();
  if (!text.includes(" - ")) return undefined;
  return text.split(" - ").slice(1).join(" - ").trim() || undefined;
}

function isFiiTicker(ticker: string): boolean {
  // Cotas e recibos de FII: XXXX11 … XXXX18
  return /^[A-Z]{4}1[1-8]$/.test(ticker) && !KNOWN_ETFS.has(ticker);
}

function textLooksLikeFii(...parts: string[]): boolean {
  const combined = parts.join(" ").toLowerCase();
  return (
    /\bfii\b/.test(combined) ||
    combined.includes("imobiliario") ||
    combined.includes("imobiliário") ||
    combined.includes("fdo inv imob") ||
    combined.includes("fundo de investimento imob") ||
    combined.includes("fund. de invest. imobili")
  );
}

export function inferAssetClass(
  ticker: string,
  product = "",
  sheetName = ""
): AssetClass {
  const sheet = sheetName.toLowerCase();
  const productUp = product.toUpperCase();

  if (sheet.includes("tesouro") || productUp.includes("TESOURO")) return "tesouro";
  if (sheet.includes("renda fixa")) return "renda_fixa";
  if (sheet.includes("bdr") || /[A-Z]{4}3[245]$/.test(ticker)) return "bdr";
  if (sheet.includes("etf") || KNOWN_ETFS.has(ticker)) return "etf";

  if (
    textLooksLikeFii(sheet, product, ticker) ||
    sheet.includes("fundo de investimento") ||
    sheet.includes("fundos imobili") ||
    isFiiTicker(ticker)
  ) {
    // Em "Fundo de Investimento" a B3 coloca FIIs listados (código *11).
    // Fundos sem ticker de bolsa caem em "outro" abaixo se não parecer FII.
    if (isFiiTicker(ticker) || textLooksLikeFii(product, sheet)) return "fii";
    if (sheet.includes("fundo de investimento") && ticker) return "fii";
  }

  if (sheet.includes("acoes") || sheet.includes("ações") || /^[A-Z]{4}\d$/.test(ticker)) {
    return "acao";
  }

  return "outro";
}

function rowsFromSheet(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
}

function detectHeaderRow(rows: unknown[][]): number {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const headers = (rows[r] ?? []).map(normalizeHeader);
    const hasQty = findBestColumn(headers, COLS.quantity) >= 0;
    const hasTicker =
      findBestColumn(headers, COLS.ticker) >= 0 || findBestColumn(headers, COLS.product) >= 0;
    if (hasTicker && hasQty) return r;
  }
  return -1;
}

function parseSheet(sheet: XLSX.WorkSheet, sheetName: string): Position[] {
  const rows = rowsFromSheet(sheet);
  const headerIdx = detectHeaderRow(rows);
  if (headerIdx < 0) return [];

  const headers = (rows[headerIdx] ?? []).map(normalizeHeader);
  const col = {
    ticker: findBestColumn(headers, COLS.ticker),
    product: findBestColumn(headers, COLS.product),
    quantity: findBestColumn(headers, COLS.quantity),
    price: findBestColumn(headers, COLS.price),
    value: findBestColumn(headers, COLS.value),
    broker: findBestColumn(headers, COLS.broker),
  };

  if (col.quantity < 0) return [];
  if (col.ticker < 0 && col.product < 0) return [];

  const positions: Position[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const productRaw = col.product >= 0 ? String(row[col.product] ?? "").trim() : "";
    const codeRaw = col.ticker >= 0 ? String(row[col.ticker] ?? "").trim() : "";

    const ticker =
      extractTicker(codeRaw) ||
      extractTicker(productRaw) ||
      (codeRaw || productRaw).trim().toUpperCase();

    if (!ticker || ticker === "TOTAL" || ticker.includes("TOTAL")) continue;

    const quantity = parseNumber(row[col.quantity]);
    if (quantity === 0) continue;

    const price = col.price >= 0 ? parseNumber(row[col.price]) : 0;
    let value = col.value >= 0 ? parseNumber(row[col.value]) : 0;
    if (!value && price) value = quantity * price;

    const name = extractProductName(productRaw) || (productRaw && productRaw !== ticker ? productRaw : undefined);

    positions.push({
      ticker,
      name,
      quantity,
      price,
      value,
      assetClass: inferAssetClass(ticker, productRaw || name || "", sheetName),
      broker: col.broker >= 0 ? String(row[col.broker] ?? "").trim() || undefined : undefined,
    });
  }
  return positions;
}

export async function parseB3Xlsx(file: File): Promise<PortfolioSnapshot> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const positions: Position[] = [];

  for (const sheetName of workbook.SheetNames) {
    const lower = sheetName.toLowerCase();
    if (lower.includes("provento") || lower.includes("negocia")) continue;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    positions.push(...parseSheet(sheet, sheetName));
  }

  const merged = new Map<string, Position>();
  for (const p of positions) {
    const key = `${p.ticker}|${p.assetClass}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...p });
      continue;
    }
    existing.quantity += p.quantity;
    existing.value += p.value;
    existing.price = existing.quantity ? existing.value / existing.quantity : existing.price;
    if (!existing.name && p.name) existing.name = p.name;
  }

  return {
    importedAt: new Date().toISOString(),
    sourceFileName: file.name,
    positions: Array.from(merged.values()).sort((a, b) => b.value - a.value),
  };
}
