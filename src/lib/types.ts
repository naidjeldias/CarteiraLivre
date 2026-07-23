export type AssetClass =
  | "acao"
  | "fii"
  | "etf"
  | "bdr"
  | "renda_fixa"
  | "tesouro"
  | "outro";

export type FiiTipo = "papel" | "tijolo" | "hibrido" | "fof" | "desenvolvimento" | "desconhecido";

export type FiiSegmento =
  | "logistica"
  | "shoppings"
  | "lajes"
  | "residencial"
  | "agro"
  | "hospitalar"
  | "educacional"
  | "hoteis"
  | "credito"
  | "foF"
  | "hibrido"
  | "outro"
  | "desconhecido";

export interface Position {
  ticker: string;
  name?: string;
  quantity: number;
  price: number;
  value: number;
  assetClass: AssetClass;
  broker?: string;
}

export interface FiiMeta {
  ticker: string;
  name: string;
  tipo: FiiTipo;
  segmento: FiiSegmento;
}

export interface PortfolioSnapshot {
  importedAt: string;
  sourceFileName: string;
  positions: Position[];
}
