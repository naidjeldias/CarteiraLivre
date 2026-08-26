import type { FiiMeta } from "./types";

/** Catálogo seed — edite/expanda conforme sua carteira. Override manual vem depois. */
export const FII_CATALOG: Record<string, FiiMeta> = {
  HGLG11: { ticker: "HGLG11", name: "CSHG Logística", tipo: "tijolo", segmento: "logistica", cnpj: "11.728.688/0001-47" },
  BTLG11: { ticker: "BTLG11", name: "BTG Logística", tipo: "tijolo", segmento: "logistica", cnpj: "11.839.593/0001-09" },
  XPLG11: { ticker: "XPLG11", name: "XP Log", tipo: "tijolo", segmento: "logistica", cnpj: "26.502.794/0001-85" },
  VILG11: { ticker: "VILG11", name: "Vinci Logística", tipo: "tijolo", segmento: "logistica", cnpj: "24.853.044/0001-22" },
  HGBS11: { ticker: "HGBS11", name: "CSHG Brasileiro Shopping", tipo: "tijolo", segmento: "shoppings", cnpj: "08.431.747/0001-06" },
  XPML11: { ticker: "XPML11", name: "XP Malls", tipo: "tijolo", segmento: "shoppings", cnpj: "28.757.546/0001-00" },
  VISC11: { ticker: "VISC11", name: "Vinci Shopping Centers", tipo: "tijolo", segmento: "shoppings", cnpj: "17.554.274/0001-25" },
  HGRE11: { ticker: "HGRE11", name: "CSHG Real Estate", tipo: "tijolo", segmento: "lajes", cnpj: "09.072.017/0001-29" },
  PVBI11: { ticker: "PVBI11", name: "VBI Prime Properties", tipo: "tijolo", segmento: "lajes", cnpj: "35.652.102/0001-76" },
  KNCR11: { ticker: "KNCR11", name: "Kinea Rendimentos", tipo: "papel", segmento: "credito", cnpj: "16.706.958/0001-32" },
  KNIP11: { ticker: "KNIP11", name: "Kinea Índices de Preços", tipo: "papel", segmento: "credito", cnpj: "24.960.430/0001-13" },
  MXRF11: { ticker: "MXRF11", name: "Maxi Renda", tipo: "papel", segmento: "credito", cnpj: "97.521.225/0001-25" },
  RECR11: { ticker: "RECR11", name: "Reco Recebíveis", tipo: "papel", segmento: "credito", cnpj: "28.152.272/0001-26" },
  IRDM11: { ticker: "IRDM11", name: "Iridium Recebíveis", tipo: "papel", segmento: "credito", cnpj: "28.830.325/0001-10" },
  IRIM11: { ticker: "IRIM11", name: "Iridium FII", tipo: "papel", segmento: "credito", cnpj: "41.076.564/0001-95" },
  HGCR11: { ticker: "HGCR11", name: "CSHG Recebíveis", tipo: "papel", segmento: "credito", cnpj: "11.160.521/0001-22" },
  RBRR11: { ticker: "RBRR11", name: "RBR High Grade", tipo: "papel", segmento: "credito", cnpj: "29.467.977/0001-03" },
  VGIP11: { ticker: "VGIP11", name: "Valora CRI Índice de Preço", tipo: "papel", segmento: "credito", cnpj: "34.197.811/0001-46" },
  CPTS11: { ticker: "CPTS11", name: "Capitânia Securities", tipo: "papel", segmento: "credito", cnpj: "18.979.895/0001-13" },
  BCFF11: { ticker: "BCFF11", name: "BTG Pactual Fundo de Fundos", tipo: "fof", segmento: "foF", cnpj: "11.026.627/0001-38" },
  BTHF11: { ticker: "BTHF11", name: "BTG Real Estate Hedge Fund", tipo: "fof", segmento: "foF", cnpj: "45.188.176/0001-57" },
  VGHF11: { ticker: "VGHF11", name: "Valora Hedge Fund", tipo: "fof", segmento: "foF", cnpj: "36.771.692/0001-19" },
  KFOF11: { ticker: "KFOF11", name: "Kinea FoF", tipo: "fof", segmento: "foF", cnpj: "30.091.444/0001-40" },
  HFOF11: { ticker: "HFOF11", name: "Hedge Top FoFs", tipo: "fof", segmento: "foF", cnpj: "18.307.582/0001-19" },
  RBRF11: { ticker: "RBRF11", name: "RBR Alpha Multiestratégia", tipo: "fof", segmento: "foF", cnpj: "27.529.279/0001-51" },
  RZTR11: { ticker: "RZTR11", name: "Riza Terrax", tipo: "tijolo", segmento: "agro", cnpj: "36.501.128/0001-86" },
  KNRI11: { ticker: "KNRI11", name: "Kinea Renda Imobiliária", tipo: "hibrido", segmento: "hibrido", cnpj: "12.005.956/0001-65" },
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
