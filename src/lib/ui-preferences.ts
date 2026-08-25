const UI_KEY = "carteiralivre.ui.v2";

interface UiPreferences {
  showValues: boolean;
}

const DEFAULTS: UiPreferences = {
  showValues: false,
};

const listeners = new Set<() => void>();

function read(): UiPreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<UiPreferences>;
    return {
      showValues:
        typeof parsed.showValues === "boolean" ? parsed.showValues : DEFAULTS.showValues,
    };
  } catch {
    return DEFAULTS;
  }
}

export function subscribeShowValues(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function loadShowValues(): boolean {
  return read().showValues;
}

export function saveShowValues(showValues: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(UI_KEY, JSON.stringify({ showValues }));
  listeners.forEach((listener) => listener());
}
