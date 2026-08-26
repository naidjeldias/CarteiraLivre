export type DisclosureType =
  | "fato_relevante"
  | "informe_mensal"
  | "informe_trimestral"
  | "relatorio_gerencial"
  | "outro";

export type DisclosureSource = "cvm" | "brapi" | "fundosnet" | "other";

export interface FiiDisclosure {
  id: string;
  ticker: string;
  cnpj?: string;
  type: DisclosureType;
  title: string;
  publishedAt: string;
  source: DisclosureSource;
  url: string;
  summary?: string;
}

export interface StoredDocument {
  disclosureId: string;
  ticker: string;
  text: string;
  fetchedAt: string;
  charCount: number;
}

export interface TickerIndex {
  ticker: string;
  cnpj?: string;
  syncedAt: string;
  syncError?: string | null;
  disclosures: FiiDisclosure[];
}

export interface CachedSummary {
  ticker: string;
  generatedAt: string;
  markdown: string;
}

export const FATOS_DAYS = 180;
export const INFORMES_MENSAL_KEEP = 6;
export const INFORMES_TRIMESTRAL_KEEP = 4;
export const RELATORIO_TEXT_MONTHS = 6;
export const SYNC_TTL_HOURS = 24;
export const SUMMARY_CACHE_HOURS = 1;
export const RAW_CACHE_TTL_HOURS = 24;
export const MAX_EXTRACT_PER_SYNC = 4;
