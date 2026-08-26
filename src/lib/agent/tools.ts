import type { FunctionDeclaration } from "@google/genai";

export const AGENT_TOOLS: FunctionDeclaration[] = [
  {
    name: "get_allocation",
    description:
      "Alocação da carteira com pesos e valores. Use para classes de ativo, tipo de FII (papel/tijolo/…) ou segmento.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        groupBy: {
          type: "string",
          enum: ["assetClass", "fiiTipo", "fiiSegmento"],
          description: "Como agrupar: classe, tipo de FII ou segmento de FII.",
        },
      },
      required: ["groupBy"],
    },
  },
  {
    name: "get_positions",
    description:
      "Lista posições da carteira com filtro, ordenação e limite. Use para maior posição, concentração ou um ticker.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        assetClass: {
          type: "string",
          enum: ["acao", "fii", "etf", "bdr", "renda_fixa", "tesouro", "outro"],
          description: "Filtrar por classe de ativo.",
        },
        ticker: {
          type: "string",
          description: "Filtrar por ticker (ex.: KNCR11).",
        },
        sortBy: {
          type: "string",
          enum: ["value", "ticker"],
          description: "Campo de ordenação. Padrão: value.",
        },
        order: {
          type: "string",
          enum: ["desc", "asc"],
          description: "Direção. Padrão: desc.",
        },
        limit: {
          type: "integer",
          description: "Quantidade máxima (1–30). Padrão: 10.",
        },
      },
    },
  },
  {
    name: "get_fii_meta",
    description: "Metadados do catálogo local de um FII: nome, tipo (papel/tijolo/…) e segmento.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Ticker do FII (ex.: HGLG11)." },
      },
      required: ["ticker"],
    },
  },
  {
    name: "get_fii_detail",
    description:
      "Detalhe de um FII: cotação, dividendos, fundamentos (P/VP, vacância) e sinal de preço. Não invente esses números.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Ticker do FII." },
      },
      required: ["ticker"],
    },
  },
  {
    name: "get_quotes",
    description:
      "Cotações de mercado ao vivo (brapi) para tickers da carteira. Se tickers vazio, usa os principais da carteira.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        tickers: {
          type: "array",
          items: { type: "string" },
          description: "Lista de tickers. Opcional.",
        },
      },
    },
  },
  {
    name: "list_recent_disclosures",
    description:
      "Linha do tempo de fatos relevantes, informes e relatórios já baixados no cache local. Sem ticker, usa os FIIs da carteira. Não invente eventos.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Um FII (ex.: KNRI11)." },
        tickers: {
          type: "array",
          items: { type: "string" },
          description: "Vários FIIs. Se vazio e sem ticker, usa a carteira.",
        },
        days: {
          type: "integer",
          description: "Janela em dias. Padrão: 180.",
        },
      },
    },
  },
  {
    name: "search_fii_documents",
    description:
      "Busca trechos dos relatórios e informes já extraídos de um FII (vacância, dívida, etc.). Cite título, data e URL.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Ticker do FII." },
        query: { type: "string", description: "Pergunta ou termos (ex.: vacância)." },
        topK: { type: "integer", description: "Quantidade de trechos (1–8). Padrão: 5." },
      },
      required: ["ticker", "query"],
    },
  },
];

export const TOOL_STATUS: Record<string, string> = {
  get_allocation: "Consultando alocação…",
  get_positions: "Listando posições…",
  get_fii_meta: "Consultando catálogo do FII…",
  get_fii_detail: "Buscando detalhes do FII…",
  get_quotes: "Buscando cotações…",
  list_recent_disclosures: "Consultando comunicados…",
  search_fii_documents: "Buscando nos documentos do FII…",
};
