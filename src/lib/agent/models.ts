export interface GeminiModelOption {
  id: string;
  label: string;
  hint?: string;
}

/** Chat-capable Gemini models (function calling). IDs must match the API. */
export const GEMINI_MODELS: GeminiModelOption[] = [
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", hint: "Recomendado" },
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", hint: "Mais recente" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", hint: "Mais rápido" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
];

export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

export function isAllowedGeminiModel(id: string): boolean {
  return GEMINI_MODELS.some((m) => m.id === id);
}
