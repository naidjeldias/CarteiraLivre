import { GoogleGenAI } from "@google/genai";
import { DEFAULT_GEMINI_MODEL, isAllowedGeminiModel } from "./models";

export function getGeminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() || undefined;
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

export function getDefaultGeminiModel(): string {
  const fromEnv = process.env.GEMINI_MODEL?.trim();
  if (fromEnv && isAllowedGeminiModel(fromEnv)) return fromEnv;
  return DEFAULT_GEMINI_MODEL;
}

export function resolveGeminiModel(requested?: string): string {
  if (requested && isAllowedGeminiModel(requested)) return requested;
  return getDefaultGeminiModel();
}

export function createGeminiClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não configurado");
  }
  return new GoogleGenAI({ apiKey });
}

function parseApiError(raw: string): { code?: number; message?: string } | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  try {
    const json = JSON.parse(raw.slice(start)) as { error?: { code?: number; message?: string } };
    return json.error ?? null;
  } catch {
    return null;
  }
}

export function geminiErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const api = parseApiError(raw);
  const lower = `${raw} ${api?.message ?? ""}`.toLowerCase();
  if (api?.code === 404 || lower.includes("not found") || lower.includes("no longer available")) {
    return "Este modelo não está disponível para sua chave. Escolha outro na lista (ex.: Gemini 3.6 Flash).";
  }
  if (lower.includes("api key") || lower.includes("api_key") || lower.includes("401") || lower.includes("403")) {
    return "Chave Gemini inválida ou sem permissão. Confira GEMINI_API_KEY em .env.local (https://aistudio.google.com/apikey) e recrie o container.";
  }
  if (lower.includes("429") || lower.includes("resource exhausted") || lower.includes("quota")) {
    return "Limite de requisições do Gemini atingido. Tente de novo em instantes.";
  }
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("econnrefused")) {
    return "Falha de rede ao falar com o Gemini. Verifique a conexão e tente novamente.";
  }
  const detail = (api?.message || raw).slice(0, 240);
  return `Falha no Gemini: ${detail}`;
}
