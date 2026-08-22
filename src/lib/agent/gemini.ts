import { GoogleGenAI } from "@google/genai";
import { friendlyAgentError } from "./errors";
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

export function geminiErrorMessage(err: unknown): string {
  return friendlyAgentError(err);
}
