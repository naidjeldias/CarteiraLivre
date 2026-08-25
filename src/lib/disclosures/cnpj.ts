import fs from "fs";
import { lookupFii } from "@/lib/fii-catalog";
import { fetchBolsaiCnpj } from "@/lib/fii-fundamentals";
import { getBrapiToken, brapiHeaders } from "@/lib/brapi-server";
import { atomicWrite, cnpjMapPath } from "./paths";

export function normalizeCnpj(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 14) return undefined;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function cnpjDigits(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 14 ? digits : undefined;
}

function readMap(): Record<string, string> {
  try {
    const raw = fs.readFileSync(cnpjMapPath(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function rememberCnpj(ticker: string, cnpj: string): void {
  const formatted = normalizeCnpj(cnpj);
  if (!formatted) return;
  const map = readMap();
  map[ticker.toUpperCase()] = formatted;
  atomicWrite(cnpjMapPath(), JSON.stringify(map, null, 2));
}

async function fetchBrapiCnpj(ticker: string): Promise<string | undefined> {
  const token = getBrapiToken();
  if (!token) return undefined;
  try {
    const url = new URL("https://brapi.dev/api/quote/" + encodeURIComponent(ticker));
    const res = await fetch(url.toString(), { headers: brapiHeaders(token), cache: "no-store" });
    if (!res.ok) return undefined;
    const j = (await res.json()) as { results?: Array<{ cnpj?: string }> };
    return normalizeCnpj(j.results?.[0]?.cnpj);
  } catch {
    return undefined;
  }
}

export async function resolveCnpj(ticker: string): Promise<string | undefined> {
  const key = ticker.trim().toUpperCase();
  const map = readMap();
  const fromMap = normalizeCnpj(map[key]);
  if (fromMap) return fromMap;

  const fromCatalog = normalizeCnpj(lookupFii(key).cnpj);
  if (fromCatalog) {
    rememberCnpj(key, fromCatalog);
    return fromCatalog;
  }

  const fromBrapi = await fetchBrapiCnpj(key);
  if (fromBrapi) {
    rememberCnpj(key, fromBrapi);
    return fromBrapi;
  }

  const fromBolsai = normalizeCnpj(await fetchBolsaiCnpj(key));
  if (fromBolsai) {
    rememberCnpj(key, fromBolsai);
    return fromBolsai;
  }

  return undefined;
}
