import { isGeminiConfigured, createGeminiClient, getDefaultGeminiModel, geminiErrorMessage } from "@/lib/agent/gemini";
import { buildFiiDetail } from "@/lib/fii-detail";
import { searchFiiDocuments } from "@/lib/rag/search";
import { listDisclosures, readCachedSummary, readTickerIndex, writeCachedSummary } from "./store";

export async function buildFiiCurrentSummary(ticker: string): Promise<{
  markdown: string;
  cached: boolean;
  geminiConfigured: boolean;
}> {
  const key = ticker.toUpperCase();
  if (!isGeminiConfigured()) {
    return {
      markdown: "",
      cached: false,
      geminiConfigured: false,
    };
  }

  const cached = readCachedSummary(key);
  if (cached) {
    return { markdown: cached.markdown, cached: true, geminiConfigured: true };
  }

  const detail = await buildFiiDetail(key, { includeHistory: false });
  const disclosures = listDisclosures(key).slice(0, 20);
  const index = readTickerIndex(key);
  let chunks: Awaited<ReturnType<typeof searchFiiDocuments>> = [];
  try {
    chunks = await searchFiiDocuments(
      key,
      "situação atual vacância inadimplência distribuição relatório gerencial",
      5
    );
  } catch {
    chunks = [];
  }

  const payload = {
    ticker: key,
    quote: detail.quote,
    dividendYieldTtm: detail.dividendYieldTtm,
    ttmPerShare: detail.ttmPerShare,
    fundamentals: detail.fundamentals
      ? {
          pvp: detail.fundamentals.pvp,
          vacancyPct: detail.fundamentals.vacancyPct,
          delinquencyPct: detail.fundamentals.delinquencyPct,
          segment: detail.fundamentals.segment,
          dividendYieldTtm: detail.fundamentals.dividendYieldTtm,
        }
      : null,
    resolvedTipo: detail.resolvedTipo,
    priceSignal: detail.priceSignal,
    providers: detail.providers,
    recentDividends: detail.dividends.slice(0, 6),
    disclosures: disclosures.map((d) => ({
      type: d.type,
      title: d.title,
      publishedAt: d.publishedAt,
      url: d.url,
      source: d.source,
    })),
    excerpts: chunks.map((c) => ({
      title: c.title,
      publishedAt: c.publishedAt,
      url: c.url,
      text: c.text.slice(0, 800),
    })),
    cache: {
      syncedAt: index?.syncedAt ?? null,
      syncError: index?.syncError ?? null,
      disclosureCount: disclosures.length,
    },
  };

  const ai = createGeminiClient();
  const result = await ai.models.generateContent({
    model: getDefaultGeminiModel(),
    contents: `Dados públicos do FII (JSON):\n${JSON.stringify(payload)}`,
    config: {
      systemInstruction: `Você resume o estado atual de um FII para um investidor educacional, em português do Brasil.

Regras:
- Use SOMENTE o JSON fornecido. Não invente preços, P/VP, DY, vacância, fatos ou datas.
- Se um número não estiver no JSON, diga que não está disponível.
- Não dê aconselhamento personalizado (não diga compre/venda/alocar X%).
- Cite documentos com data, tipo e URL quando mencionar um fato ou informe.

Estruture a resposta em markdown com exatamente estas seções:
## Situação atual
Cota, sinal de preço, P/VP e DY — só com os números recebidos.
## Destaques recentes
Lista com data + tipo + título + link dos fatos/informes/relatórios materiais.
## Leitura analítica
Tom educacional; relate o que os dados e textos sugerem, com citações.
## Limitações
Provedores ausentes, cache vazio, falhas de extração ou syncError.`,
    },
  });

  const markdown = (result.text || "").trim();
  if (!markdown) {
    throw new Error("O Gemini devolveu uma resposta vazia.");
  }
  writeCachedSummary({ ticker: key, generatedAt: new Date().toISOString(), markdown });
  return { markdown, cached: false, geminiConfigured: true };
}

export { geminiErrorMessage };
