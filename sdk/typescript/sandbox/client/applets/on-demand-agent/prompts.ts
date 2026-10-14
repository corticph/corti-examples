/**
 * The cleanup prompt library: named, language-tagged system prompts for the
 * copy-editor agent.
 *
 * WHY THIS EXISTS: there used to be exactly one system prompt per API client
 * (`copyEdit.systemPrompt`). Dictating in Danish and then in English meant
 * hand-editing that single prompt each time, because a copy-editor instructed
 * in English will happily "correct" Danish text into English. A prompt is only
 * ever right for the language it was written for, so the language is part of
 * the prompt's identity here, not a label bolted on.
 *
 * SELECTION: `resolveActivePrompt` picks the entry matching the current
 * dictation language, unless the user has pinned one explicitly. The pin and
 * the user's own prompts persist per API client (clientId:tenant) through the
 * same ConfigStore seam the command / replacement / term stores use, so
 * switching tenant doesn't leak prompts across environments.
 *
 * The resolution helpers are pure and exported for tests — getting the wrong
 * prompt silently rewrites clinical text in the wrong language, which is the
 * one failure here worth pinning down with unit tests.
 */
import { useMemo, useSyncExternalStore } from "react";
import {
  type ConfigStore,
  createLocalConfigStore,
  identityNamespace,
} from "../_shared/configStore";
import { createRuleStore, type RuleBase } from "../_shared/ruleStore";

export const DEFAULT_PROMPT = `You are a meticulous copy editor for dictated clinical text.
Apply ONLY the minimal spelling, grammar, capitalization, spacing, and punctuation corrections needed to make the text readable and adherent to standard written conventions.
Do NOT reword, rephrase, summarize, expand, or remove content. Do NOT change clinical meaning, numbers, units, medication names, or the author's vocabulary and style.
Preserve line breaks and overall structure.
Return ONLY the corrected text — no commentary, preamble, labels, or quotation marks.`;

export interface CleanupPrompt extends RuleBase {
  /** Shown in the library list and the active-prompt readout. */
  title: string;
  /**
   * Dictation language this prompt is written for, as a Corti transcribe
   * language tag ("en", "da", "en-US"). Free-form rather than an enum: the
   * supported set comes from the dictation component at runtime and grows
   * server-side without a client release.
   */
  language: string;
  /** The system prompt installed on the agent when this entry is active. */
  prompt: string;
}

const CATALOG: CleanupPrompt[] = [
  {
    id: "builtin:minimal-en",
    builtin: true,
    title: "Minimal copy edit",
    language: "en",
    prompt: DEFAULT_PROMPT,
  },
];

/**
 * Holds the user's own entries only — the catalog is merged in by
 * `mergeWithCatalog` rather than passed to the store.
 *
 * WHY NOT the store's own catalog support: `createRuleStore` persists only
 * `!builtin` items and re-merges the catalog on every load, so an edit to a
 * built-in would be dropped on reload, and a saved copy sharing the built-in's
 * id would come back as a duplicate row. Merging here lets a saved entry
 * OVERRIDE the catalog entry of the same id, which is what makes the built-in
 * prompt editable — and deleting that entry restores the original.
 */
export const promptStore = createRuleStore<CleanupPrompt>("copyEdit.prompts", []);

/** Whether `id` names a catalog entry (so it can be reset rather than removed). */
export function isCatalogPrompt(id: string): boolean {
  return CATALOG.some((entry) => entry.id === id);
}

export type PromptOrigin = "builtin" | "edited" | "custom";

/** How an entry came to be, for the badge in the library list. */
export function promptOrigin(item: CleanupPrompt): PromptOrigin {
  if (item.builtin) {
    return "builtin";
  }
  return isCatalogPrompt(item.id) ? "edited" : "custom";
}

/**
 * Catalog entries first — replaced by the user's edit where one exists — then
 * the user's own prompts in stored order. Keeping catalog position stable means
 * editing the built-in doesn't make it jump down the list.
 */
export function mergeWithCatalog(userItems: CleanupPrompt[]): CleanupPrompt[] {
  const pending = new Map(userItems.map((item) => [item.id, item]));
  const merged: CleanupPrompt[] = [];
  for (const entry of CATALOG) {
    merged.push(pending.get(entry.id) ?? entry);
    pending.delete(entry.id);
  }
  for (const item of userItems) {
    if (pending.has(item.id)) {
      merged.push(item);
    }
  }
  return merged;
}

/** The full library: the catalog with the user's edits and additions applied. */
export function useCleanupPrompts(): CleanupPrompt[] {
  const userItems = promptStore.useItems();
  return useMemo(() => mergeWithCatalog(userItems), [userItems]);
}

/**
 * Save an edit or a new prompt. Always stored as a user entry, including when it
 * overrides a catalog id — that's what persists it.
 */
export function saveCleanupPrompt(item: CleanupPrompt) {
  promptStore.upsert({ ...item, builtin: false });
}

/** Drop a user entry. For a catalog id this restores the built-in original. */
export function removeCleanupPrompt(id: string) {
  promptStore.removeMany([id]);
}

/* ------------------------------------------------------------------ */
/* language matching                                                   */
/* ------------------------------------------------------------------ */

/** Base subtag of a language tag: "en-US" → "en". */
function baseTag(language: string): string {
  return language.toLowerCase().trim().split(/[-_]/)[0];
}

/**
 * Whether a prompt written for `promptLanguage` applies to dictation in
 * `dictationLanguage`.
 *
 * Region-tolerant in both directions — a prompt tagged "en" is the right prompt
 * for "en-US" dictation, and vice versa. Copy-editing rules are a property of
 * the language, not the locale, so requiring an exact tag match would leave the
 * user with no prompt for the sake of a distinction that doesn't matter here.
 */
export function languageMatches(promptLanguage: string, dictationLanguage: string): boolean {
  if (!promptLanguage || !dictationLanguage) {
    return false;
  }
  const a = promptLanguage.toLowerCase().trim();
  const b = dictationLanguage.toLowerCase().trim();
  return a === b || baseTag(a) === baseTag(b);
}

export interface ActivePrompt {
  /** The prompt to run, or null when the library is empty. */
  prompt: CleanupPrompt | null;
  /** How it was chosen — drives the panel's explanation of what's happening. */
  reason: "pinned" | "language" | "fallback" | "empty";
}

/**
 * Choose the prompt to run.
 *
 * A pin always wins, including when its language disagrees with what's being
 * dictated: an explicit choice by the user is not something to second-guess.
 * Otherwise prefer an exact tag match over a base-subtag one, so a prompt
 * written specifically for "en-US" beats the generic "en" entry when dictating
 * en-US. Falling back to *some* prompt beats refusing to run, but the caller is
 * told via `reason` so it can say the language doesn't match.
 */
export function resolveActivePrompt(
  prompts: CleanupPrompt[],
  dictationLanguage: string,
  pinnedId: string | null,
): ActivePrompt {
  if (pinnedId) {
    const pinned = prompts.find((p) => p.id === pinnedId);
    if (pinned) {
      return { prompt: pinned, reason: "pinned" };
    }
  }
  const tag = dictationLanguage.toLowerCase().trim();
  const exact = prompts.find((p) => p.language.toLowerCase().trim() === tag);
  if (exact) {
    return { prompt: exact, reason: "language" };
  }
  const loose = prompts.find((p) => languageMatches(p.language, tag));
  if (loose) {
    return { prompt: loose, reason: "language" };
  }
  const fallback = prompts.find((p) => p.builtin) ?? prompts[0];
  if (fallback) {
    return { prompt: fallback, reason: "fallback" };
  }
  return { prompt: null, reason: "empty" };
}

/* ------------------------------------------------------------------ */
/* the pin                                                             */
/* ------------------------------------------------------------------ */

const PIN_KEY = "copyEdit.pinnedPromptId";

let pinNamespace = "default";
let pinStore: ConfigStore = createLocalConfigStore(pinNamespace);
let pinnedId: string | null = pinStore.get<string>(PIN_KEY, "") || null;

const pinListeners = new Set<() => void>();
const pinSubscribe = (l: () => void) => {
  pinListeners.add(l);
  return () => pinListeners.delete(l);
};
const pinSnapshot = () => pinnedId;
const emitPin = () => {
  pinListeners.forEach((l) => {
    l();
  });
};

/** `null` means "follow the dictation language". */
export function setPinnedPromptId(id: string | null) {
  if (id === pinnedId) {
    return;
  }
  pinnedId = id;
  pinStore.set(PIN_KEY, id ?? "");
  emitPin();
}

export function usePinnedPromptId(): string | null {
  return useSyncExternalStore(pinSubscribe, pinSnapshot, pinSnapshot);
}

/**
 * Point both the library and the pin at one API client's namespace. Wraps the
 * two so callers can't update one and forget the other, which would pin an id
 * belonging to a different tenant's library.
 */
export function setPromptIdentity(clientId?: string, tenant?: string) {
  promptStore.setIdentity(clientId, tenant);
  const ns = identityNamespace(clientId, tenant);
  if (ns === pinNamespace) {
    return;
  }
  pinNamespace = ns;
  pinStore = createLocalConfigStore(ns);
  pinnedId = pinStore.get<string>(PIN_KEY, "") || null;
  emitPin();
}

/** JSON payload for the library's export button. */
export function toExport(prompts: CleanupPrompt[]) {
  return {
    prompts: prompts.map(({ title, language, prompt }) => ({
      title,
      language,
      prompt,
    })),
  };
}
