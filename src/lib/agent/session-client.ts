import { DEFAULT_GEMINI_MODEL } from "./models";

/** Load the shared Gemini model from the in-memory assistant session. */
export async function fetchSessionModel(): Promise<string> {
  try {
    const res = await fetch("/api/agent/session");
    if (!res.ok) return DEFAULT_GEMINI_MODEL;
    const data = (await res.json()) as { model?: string };
    return typeof data.model === "string" ? data.model : DEFAULT_GEMINI_MODEL;
  } catch {
    return DEFAULT_GEMINI_MODEL;
  }
}

/** Persist the shared Gemini model to the in-memory assistant session. */
export function persistSessionModel(model: string): void {
  void fetch("/api/agent/session", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  }).catch(() => {
    // best-effort
  });
}
