/**
 * The cleanup prompt library: named, language-tagged system prompts for the
 * copy-editor agent.
 *
 * Each prompt defines a title, a language tag (informational — the prompt is
 * written for that language), a system prompt body, and a command phrase that
 * triggers the agent by voice when the prompt is active.
 *
 * SELECTION: the user explicitly picks which prompt to run from a dropdown.
 * There is no automatic language matching — a prompt is only correct for the
 * language it was written for, so auto-selecting risks silently rewriting
 * clinical text in the wrong language. The first built-in is the default.
 *
 * The user's own prompts and the selection persist per API client
 * (clientId:tenant) through the same ConfigStore seam the command / replacement
 * / term stores use, so switching tenant doesn't leak prompts across
 * environments.
 *
 * The resolution helpers are pure and exported for tests — getting the wrong
 * prompt silently rewrites clinical text, which is the one failure here worth
 * pinning down with unit tests.
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

export const SUMMARY_LIST_PROMPT = `You are a meticulous copy editor for dictated clinical text.
Apply ONLY the minimal spelling, grammar, capitalization, spacing, and punctuation corrections needed to make the text readable and adherent to standard written conventions.
Rephrase, summarize, and restructure the narrative paragraphs into concise bullet points.
Do NOT change clinical meaning, numbers, units, medication names, or the author's vocabulary.
Return ONLY the corrected text — no commentary, preamble, labels, or quotation marks.`;

export interface CleanupPrompt extends RuleBase {
  /** Shown in the library list and the active-prompt readout. */
  title: string;
  /**
   * Dictation language this prompt is written for, as a Corti transcribe
   * language tag ("en", "da", "en-US"). Informational only — does not drive
   * automatic selection.
   */
  language: string;
  /** The system prompt installed on the agent when this entry is active. */
  prompt: string;
  /** Voice command phrase that triggers the agent when this prompt is active. */
  commandPhrase: string;
}

const CATALOG: CleanupPrompt[] = [
  {
    id: "builtin:minimal-en",
    builtin: true,
    title: "Minimal copy edit",
    language: "en",
    prompt: DEFAULT_PROMPT,
    commandPhrase: "copy edit",
  },
  {
    id: "builtin:summary-list-en",
    builtin: true,
    title: "Summary list",
    language: "en",
    prompt: SUMMARY_LIST_PROMPT,
    commandPhrase: "summarize that",
  },
];

/** The default selected prompt id (first catalog entry). */
export const DEFAULT_PROMPT_ID = CATALOG[0].id;

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

/** Resolve the selected prompt from the library, falling back to the default. */
export function resolveSelectedPrompt(prompts: CleanupPrompt[], id: string): CleanupPrompt | null {
  if (id) {
    const found = prompts.find((p) => p.id === id);
    if (found) {
      return found;
    }
  }
  return prompts[0] ?? null;
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
/* selection                                                           */
/* ------------------------------------------------------------------ */

const SELECTION_KEY = "copyEdit.selectedPromptId";

let selNamespace = "default";
let selStore: ConfigStore = createLocalConfigStore(selNamespace);
let selectedId: string = selStore.get<string>(SELECTION_KEY, "") || DEFAULT_PROMPT_ID;

const selListeners = new Set<() => void>();
const selSubscribe = (l: () => void) => {
  selListeners.add(l);
  return () => selListeners.delete(l);
};
const selSnapshot = () => selectedId;
const emitSel = () => {
  selListeners.forEach((l) => {
    l();
  });
};

export function setSelectedPromptId(id: string) {
  if (id === selectedId) {
    return;
  }
  selectedId = id;
  selStore.set(SELECTION_KEY, id);
  emitSel();
}

export function useSelectedPromptId(): string {
  return useSyncExternalStore(selSubscribe, selSnapshot, selSnapshot);
}

/**
 * Point both the library and the selection at one API client's namespace.
 * `scope` is an app-specific suffix so each app (on-demand, dictation suite,
 * speech-flex) keeps its own prompt selection under the same clientId:tenant.
 */
export function setPromptIdentity(clientId?: string, tenant?: string, scope?: string) {
  promptStore.setIdentity(clientId, tenant);
  const ns = identityNamespace(clientId, tenant);
  const scopedNs = scope ? `${ns}:${scope}` : ns;
  if (scopedNs === selNamespace) {
    return;
  }
  selNamespace = scopedNs;
  selStore = createLocalConfigStore(scopedNs);
  selectedId = selStore.get<string>(SELECTION_KEY, "") || DEFAULT_PROMPT_ID;
  emitSel();
}

/** JSON payload for the library's export button. */
export function toExport(prompts: CleanupPrompt[]) {
  return {
    prompts: prompts.map(({ title, language, prompt, commandPhrase }) => ({
      title,
      language,
      prompt,
      commandPhrase,
    })),
  };
}
