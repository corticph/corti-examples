/**
 * The second-pass agent library: named system prompts for post-transcript
 * processing. Each entry defines a name and a prompt — the user picks which
 * agent to run from a dropdown in the live demo.
 *
 * Pattern mirrors the on-demand agent's prompt library but simpler: no
 * language matching, no command phrase, no pinning — just a direct selection.
 */
import { useMemo, useSyncExternalStore } from "react";
import { createLocalConfigStore, identityNamespace } from "../_shared/configStore";
import { createRuleStore, type RuleBase } from "../_shared/ruleStore";

export const CLINICAL_SUMMARY_PROMPT = `You are a second-pass processor for healthcare transcripts.
You will receive transcript text that may include speaker or channel labels.
Produce a structured clinical summary with these sections:
Reason for visit, Findings, Assessment, Plan.
Maximum 2 sentences per section. Use a new line for each section.
Preserve important medications, numbers, units, timing, and uncertainty.
Return only the final result with no preamble, labels, or markdown fences.`;

export const SPANISH_TRANSLATION_PROMPT = `You are a second-pass processor for healthcare transcripts.
You will receive transcript text that may include speaker or channel labels.
Translate the transcript into Spanish, preserving all clinical meaning, medications, numbers, units, and timing.
Maintain the speaker or channel labels in the translation.
Return only the translated text with no preamble, labels, or markdown fences.`;

export const REFERRAL_LETTER_PROMPT = `You are a second-pass processor for healthcare transcripts.
You will receive transcript text that may include speaker or channel labels.
Produce a referral letter addressed to a specialist.
Include the reason for referral, relevant clinical findings, and any specific questions for the specialist.
Keep it concise and professional, maximum 1 paragraph.
Preserve important medications, numbers, units, timing, and uncertainty.
Return only the final result with no preamble, labels, or markdown fences.`;

export interface AgentEntry extends RuleBase {
  /** Display name shown in the library list and the live demo dropdown. */
  name: string;
  /** The system prompt installed on the agent when this entry is selected. */
  prompt: string;
}

const CATALOG: AgentEntry[] = [
  {
    id: "builtin:clinical-summary",
    builtin: true,
    name: "Clinical summary",
    prompt: CLINICAL_SUMMARY_PROMPT,
  },
  {
    id: "builtin:spanish-translation",
    builtin: true,
    name: "Spanish translation",
    prompt: SPANISH_TRANSLATION_PROMPT,
  },
  {
    id: "builtin:referral-letter",
    builtin: true,
    name: "Referral letter",
    prompt: REFERRAL_LETTER_PROMPT,
  },
];

export const agentStore = createRuleStore<AgentEntry>("secondPass.agents", []);

/** Whether `id` names a catalog entry (so it can be reset rather than removed). */
export function isCatalogAgent(id: string): boolean {
  return CATALOG.some((entry) => entry.id === id);
}

export type AgentOrigin = "builtin" | "edited" | "custom";

export function agentOrigin(item: AgentEntry): AgentOrigin {
  if (item.builtin) {
    return "builtin";
  }
  return isCatalogAgent(item.id) ? "edited" : "custom";
}

export function mergeWithCatalog(userItems: AgentEntry[]): AgentEntry[] {
  const pending = new Map(userItems.map((item) => [item.id, item]));
  const merged: AgentEntry[] = [];
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

export function useAgentLibrary(): AgentEntry[] {
  const userItems = agentStore.useItems();
  return useMemo(() => mergeWithCatalog(userItems), [userItems]);
}

export function saveAgentEntry(item: AgentEntry) {
  agentStore.upsert({ ...item, builtin: false });
}

export function removeAgentEntry(id: string) {
  agentStore.removeMany([id]);
}

export function setAgentLibraryIdentity(clientId?: string, tenant?: string) {
  agentStore.setIdentity(clientId, tenant);
}

/* ------------------------------------------------------------------ */
/* selection                                                            */
/* ------------------------------------------------------------------ */

const SELECTED_KEY = "secondPass.selectedAgentId";

let selNamespace = "default";
let selStore = createLocalConfigStore(selNamespace);
let selectedId: string = selStore.get<string>(SELECTED_KEY, "") || "";

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

export function setSelectedAgentId(id: string) {
  if (id === selectedId) {
    return;
  }
  selectedId = id;
  selStore.set(SELECTED_KEY, id);
  emitSel();
}

export function useSelectedAgentId(): string {
  return useSyncExternalStore(selSubscribe, selSnapshot, selSnapshot);
}

/** Resolve the selected entry from the library, falling back to the first. */
export function resolveSelectedAgent(library: AgentEntry[], id: string): AgentEntry | null {
  if (id) {
    const found = library.find((a) => a.id === id);
    if (found) {
      return found;
    }
  }
  return library[0] ?? null;
}

export function setSelectionIdentity(clientId?: string, tenant?: string) {
  const ns = identityNamespace(clientId, tenant);
  if (ns === selNamespace) {
    return;
  }
  selNamespace = ns;
  selStore = createLocalConfigStore(ns);
  selectedId = selStore.get<string>(SELECTED_KEY, "") || "";
  emitSel();
}

/** JSON payload for the library's export button. */
export function toExport(agents: AgentEntry[]) {
  return {
    agents: agents.map(({ name, prompt }) => ({ name, prompt })),
  };
}
