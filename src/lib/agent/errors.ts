function parseApiError(raw: string): { code?: number; status?: string; message?: string } | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  try {
    const json = JSON.parse(raw.slice(start)) as {
      error?: { code?: number; status?: string; message?: string };
    };
    return json.error ?? null;
  } catch {
    return null;
  }
}

/** Maps Gemini/SDK errors to a short PT-BR message. Never forwards raw English dumps. */
export function friendlyAgentError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const api = parseApiError(raw);
  const lower = `${raw} ${api?.message ?? ""} ${api?.status ?? ""}`.toLowerCase();

  if (api?.code === 404 || lower.includes("not found") || lower.includes("no longer available")) {
    return "Este modelo não está disponível. Escolha outro na lista e tente de novo.";
  }
  if (
    api?.code === 429 ||
    api?.code === 503 ||
    lower.includes("unavailable") ||
    lower.includes("high demand") ||
    lower.includes("overloaded") ||
    lower.includes("resource exhausted") ||
    lower.includes("try again later") ||
    lower.includes("quota")
  ) {
    return "O Gemini está ocupado agora. Aguarde um momento e tente de novo, ou escolha outro modelo.";
  }
  if (lower.includes("api key") || lower.includes("api_key") || lower.includes("401") || lower.includes("403")) {
    return "A chave do Gemini está inválida ou sem permissão. Confira GEMINI_API_KEY e recrie o container.";
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborted")) {
    return "A resposta demorou demais. Tente de novo.";
  }
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("econnrefused")) {
    return "Falha de rede ao falar com o Gemini. Verifique a conexão e tente novamente.";
  }
  if (/[áéíóúãõç]/i.test(raw) && !raw.includes("{") && raw.length < 220) {
    return raw;
  }
  return "Não consegui obter resposta do Gemini. Tente novamente.";
}
