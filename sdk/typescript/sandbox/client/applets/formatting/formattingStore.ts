import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_FORMATTING, type FormattingConfig } from "./formattingOptions";

const STORAGE_KEY = "corti-examples:formatting-config";

let config: FormattingConfig = loadConfig();
const listeners = new Set<() => void>();

function loadConfig(): FormattingConfig {
  try {
    if (typeof localStorage === "undefined") {
      return { ...DEFAULT_FORMATTING };
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_FORMATTING };
    }
    const parsed = JSON.parse(raw) as Partial<FormattingConfig>;
    return {
      dates: parsed.dates ?? DEFAULT_FORMATTING.dates,
      times: parsed.times ?? DEFAULT_FORMATTING.times,
      numbers: parsed.numbers ?? DEFAULT_FORMATTING.numbers,
      measurements: parsed.measurements ?? DEFAULT_FORMATTING.measurements,
      numericRanges: parsed.numericRanges ?? DEFAULT_FORMATTING.numericRanges,
      ordinals: parsed.ordinals ?? DEFAULT_FORMATTING.ordinals,
    };
  } catch {
    return { ...DEFAULT_FORMATTING };
  }
}

function persist() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  } catch {
    /* ignore quota errors */
  }
}

function emit() {
  for (const l of listeners) {
    l();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): FormattingConfig {
  return config;
}

function setConfig(next: FormattingConfig) {
  config = next;
  persist();
  emit();
}

function resetConfig() {
  config = { ...DEFAULT_FORMATTING };
  persist();
  emit();
}

export function useFormattingConfig(): {
  config: FormattingConfig;
  setConfig: (next: FormattingConfig) => void;
  reset: () => void;
} {
  const config = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const set = useCallback((next: FormattingConfig) => {
    setConfig(next);
  }, []);

  const reset = useCallback(() => {
    resetConfig();
  }, []);

  return { config, setConfig: set, reset };
}
