/**
 * Global dictation language store with localStorage persistence.
 *
 * Every applet hardcodes `LANGUAGE = "en"` and builds `dictationConfig` with
 * `primaryLanguage: LANGUAGE`. The `<corti-dictation>` / `<corti-ambient>` web
 * components have a language selector in their settings UI, but when the user
 * picks a language there the inner `DictationRoot` updates its own
 * `dictationConfig.primaryLanguage` — the outer `_dictationConfig` field is NOT
 * mutated. So the next React re-render re-passes the stale `primaryLanguage:
 * "en"` down, clobbering the selection.
 *
 * This hook fixes that by:
 * 1. Holding the selected language in a module-level store (shared by all
 *    applets on the page) with `useSyncExternalStore` reactivity.
 * 2. Persisting to `localStorage` so the choice survives reloads.
 * 3. Providing a stable `onLanguagesChanged` event handler that applets pass to
 *    the web component — it reads `e.detail.selectedLanguage` and updates the
 *    store, so the next render builds `dictationConfig` with the right language.
 */
import type { LanguagesChangedEventDetail } from "@corti/dictation-web";
import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "corti-examples:dictation-language";
const DEFAULT_LANGUAGE = "en";

let language: string = loadLanguage();
/**
 * Languages the component reported as available, for UI that has to offer a
 * choice of language (the cleanup prompt library). Not persisted: it's a
 * property of the cluster/model, so it's re-reported on every mount, and a
 * stale cached list would offer languages this deployment can't dictate in.
 */
let availableLanguages: string[] = [];
const listeners = new Set<() => void>();

function loadLanguage(): string {
  try {
    if (typeof localStorage === "undefined") {
      return DEFAULT_LANGUAGE;
    }
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function persist() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, language);
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

function getSnapshot(): string {
  return language;
}

function getLanguagesSnapshot(): string[] {
  return availableLanguages;
}

/**
 * Replace the available-language list, keeping the array identity stable when
 * the contents are unchanged — `useSyncExternalStore` compares snapshots by
 * reference, and the component re-reports the same list on every mount.
 */
function setAvailableLanguages(next: string[]) {
  if (
    next.length === availableLanguages.length &&
    next.every((l, i) => l === availableLanguages[i])
  ) {
    return;
  }
  availableLanguages = next;
  emit();
}

/** The languages the dictation component last reported as available. */
export function useAvailableLanguages(): string[] {
  return useSyncExternalStore(subscribe, getLanguagesSnapshot, getLanguagesSnapshot);
}

function setLanguage(next: string) {
  if (!next || next === language) {
    return;
  }
  language = next;
  persist();
  emit();
}

/**
 * Returns the current dictation language and a stable `onLanguagesChanged`
 * handler. Pass the handler to `<CortiDictationComponent>` /
 * `<CortiAmbientComponent>` so UI language changes persist and propagate.
 */
export function useDictationLanguage(): {
  language: string;
  onLanguagesChanged: (e: CustomEvent<LanguagesChangedEventDetail>) => void;
} {
  const language = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const onLanguagesChanged = useCallback((e: CustomEvent<LanguagesChangedEventDetail>) => {
    const next = e.detail?.selectedLanguage;
    if (next) {
      setLanguage(next);
    }
    if (Array.isArray(e.detail?.languages)) {
      setAvailableLanguages(e.detail.languages.filter(Boolean));
    }
  }, []);

  return { language, onLanguagesChanged };
}
