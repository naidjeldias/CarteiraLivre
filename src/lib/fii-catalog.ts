import type { FiiMeta } from "./types";

/** Catálogo seed — edite/expanda conforme sua carteira. Override manual vem depois. */
export const FII_CATALOG: Record<string, FiiMeta> = {
  HGLG11: { ticker: "HGLG11", name: "CSHG Logística", tipo: "tijolo", segmento: "logistica" },
  BTLG11: { ticker: "BTLG11", name: "BTG Logística", tipo: "tijolo", segmento: "logistica" },
  XPLG11: { ticker: "XPLG11", name: "XP Log", tipo: "tijolo", segmento: "logistica" },
  VILG11: { ticker: "VILG11", name: "Vinci Logística", tipo: "tijolo", segmento: "logistica" },
  HGBS11: { ticker: "HGBS11", name: "CSHG Brasileiro Shopping", tipo: "tijolo", segmento: "shoppings" },
  XPML11: { ticker: "XPML11", name: "XP Malls", tipo: "tijolo", segmento: "shoppings" },
  VISC11: { ticker: "VISC11", name: "Vinci Shopping Centers", tipo: "tijolo", segmento: "shoppings" },
  HGRE11: { ticker: "HGRE11", name: "CSHG Real Estate", tipo: "tijolo", segmento: "lajes" },
  PVBI11: { ticker: "PVBI11", name: "VBI Prime Properties", tipo: "tijolo", segmento: "lajes" },
  KNCR11: { ticker: "KNCR11", name: "Kinea Rendimentos", tipo: "papel", segmento: "credito" },
  KNIP11: { ticker: "KNIP11", name: "Kinea Índices de Preços", tipo: "papel", segmento: "credito" },
  MXRF11: { ticker: "MXRF11", name: "Maxi Renda", tipo: "papel", segmento: "credito" },
  RECR11: { ticker: "RECR11", name: "Reco Recebíveis", tipo: "papel", segmento: "credito" },
  IRDM11: { ticker: "IRDM11", name: "Iridium Recebíveis", tipo: "papel", segmento: "credito" },
  IRIM11: { ticker: "IRIM11", name: "Iridium FII", tipo: "papel", segmento: "credito" },
  HGCR11: { ticker: "HGCR11", name: "CSHG Recebíveis", tipo: "papel", segmento: "credito" },
  RBRR11: { ticker: "RBRR11", name: "RBR High Grade", tipo: "papel", segmento: "credito" },
  VGIP11: { ticker: "VGIP11", name: "Valora CRI Índice de Preço", tipo: "papel", segmento: "credito" },
  CPTS11: { ticker: "CPTS11", name: "Capitânia Securities", tipo: "papel", segmento: "credito" },
  BCFF11: { ticker: "BCFF11", name: "BTG Pactual Fundo de Fundos", tipo: "fof", segmento: "foF" },
  BTHF11: { ticker: "BTHF11", name: "BTG Real Estate Hedge Fund", tipo: "fof", segmento: "foF" },
  VGHF11: { ticker: "VGHF11", name: "Valora Hedge Fund", tipo: "fof", segmento: "foF" },
  KFOF11: { ticker: "KFOF11", name: "Kinea FoF", tipo: "fof", segmento: "foF" },
  HFOF11: { ticker: "HFOF11", name: "Hedge Top FoFs", tipo: "fof", segmento: "foF" },
  RBRF11: { ticker: "RBRF11", name: "RBR Alpha Multiestratégia", tipo: "fof", segmento: "foF" },
  RZTR11: { ticker: "RZTR11", name: "Riza Terrax", tipo: "tijolo", segmento: "agro" },
  KNRI11: { ticker: "KNRI11", name: "Kinea Renda Imobiliária", tipo: "hibrido", segmento: "hibrido" },
};

/** Recibos de subscrição (*12–*18) herdam a classificação da cota *11. */
function parentCotaTicker(ticker: string): string | null {
  const m = ticker.toUpperCase().match(/^([A-Z]{4})1[2-8]$/);
  return m ? `${m[1]}11` : null;
}

export function lookupFii(ticker: string): FiiMeta {
  const key = ticker.trim().toUpperCase();
  const direct = FII_CATALOG[key];
  if (direct) return direct;

  const parent = parentCotaTicker(key);
  if (parent && FII_CATALOG[parent]) {
    return { ...FII_CATALOG[parent], ticker: key, name: `${FII_CATALOG[parent].name} (recibo)` };
  }

  return {
    ticker: key,
    name: key,
    tipo: "desconhecido",
    segmento: "desconhecido",
  };
}
