const SESSION_KEY = "carteiralivre.ui.session";
const LEGACY_KEYS = ["carteiralivre.ui.v1", "carteiralivre.ui.v2"];

interface UiPreferences {
  showValues: boolean;
}

const DEFAULTS: UiPreferences = {
  showValues: false,
};

const listeners = new Set<() => void>();

function read(): UiPreferences {
  if (typeof window === "undefined") return DEFAULTS;

  for (const key of LEGACY_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // private mode — ignore
    }
  }

  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
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
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ showValues }));
  } catch {
    // quota / private mode — ignore
  }
  listeners.forEach((listener) => listener());
}
