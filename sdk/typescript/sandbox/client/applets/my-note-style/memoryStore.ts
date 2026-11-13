/**
 * localStorage-backed store for learned memory entries — the accumulated
 * "personalisation rules" the applet learns from edits to generated notes.
 *
 * Each entry records one edit cycle: which section changed, whether the agent
 * classified it as a soft style adjustment or a hard memory rule, which prompt
 * surface it targets, and the proposed prompt update. `source` records whether
 * the entry came from edit interpretation ("agent") or the memory-log "Add
 * rule" form ("manual") — agent entries are complete prompt replacements that
 * merge their predecessors, while manual rules are independent one-line
 * instructions (see buildOverrides for how the two accumulate).
 *
 * Namespaced by API client (clientId:tenant) via configStore, the same seam
 * every other applet uses for per-tenant persistence.
 */
import {
  type ConfigStore,
  createLocalConfigStore,
  identityNamespace,
} from "../_shared/configStore";

export type MemoryClassification = "soft" | "hard";

export type PromptSurface = "contentPrompt" | "writingStylePrompt" | "miscPrompt";

export interface MemoryEntry {
  id: string;
  sectionId: string;
  sectionHeading: string;
  classification: MemoryClassification;
  promptSurface: PromptSurface;
  changeDescription: string;
  proposedPromptUpdate: string;
  rationale: string;
  originalText: string;
  editedText: string;
  createdAt: string;
  /** How the entry was learned — edit interpretation or the "Add rule" form. */
  source?: "agent" | "manual";
}

const MEMORY_KEY = "myNoteStyle.memories";

let namespace = "default";
let store: ConfigStore = createLocalConfigStore(namespace);

/** Wire the store to a specific API client / tenant. */
export function configureMemoryStore(clientId?: string, tenant?: string) {
  const next = identityNamespace(clientId, tenant);
  if (next !== namespace) {
    namespace = next;
    store = createLocalConfigStore(next);
  }
}

export function loadMemories(): MemoryEntry[] {
  return store.get<MemoryEntry[]>(MEMORY_KEY, []);
}

export function saveMemories(entries: MemoryEntry[]): void {
  store.set(MEMORY_KEY, entries);
}

export function addMemory(entry: MemoryEntry): MemoryEntry[] {
  const all = loadMemories();
  all.push(entry);
  saveMemories(all);
  return all;
}

export function removeMemory(id: string): MemoryEntry[] {
  const all = loadMemories().filter((e) => e.id !== id);
  saveMemories(all);
  return all;
}

export function clearMemories(): void {
  saveMemories([]);
}
