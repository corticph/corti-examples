/**
 * Agent wiring for the on-demand copy-editor: the agent status, the run logic,
 * and the undo snapshot, exposed via useSyncExternalStore.
 *
 * The prompts themselves live in prompts.ts — this module holds no prompt of its
 * own and no opinion about which one is right. Callers push the active prompt in
 * with `setActivePrompt`; everything here just keeps the remote agent's
 * systemPrompt equal to whatever was last pushed.
 *
 * ONE AGENT, SWAPPED PROMPT: the agent is created on first use and cached per
 * API client, and its systemPrompt is updated in place when the active prompt
 * changes. An agent per library entry would litter the tenant with agents for
 * every prompt anyone ever tried, and they'd outlive the local library that
 * named them.
 */

import type { CortiAuth } from "@corti/sdk";
import { CortiClient } from "@corti/sdk";
import { useSyncExternalStore } from "react";
import {
  type ConfigStore,
  createLocalConfigStore,
  identityNamespace,
} from "../_shared/configStore";
import {
  type AgentSpec,
  describeAgentError,
  ensureAgent,
  sendAgentMessage,
} from "../_shared/cortiAgent";
import type { EditorAdapter } from "../_shared/editorAdapter";
import type { CortiSdkEnvironment } from "../_shared/useCortiAccessToken";

export const COPY_EDIT_AGENT = {
  name: "Copy Editor",
  description:
    "Minimal spelling, grammar, capitalization, spacing, and punctuation copy-editor for dictated text.",
};

export const COPY_EDIT_COMMAND_ID = "copy_edit";
const AGENT_ID_KEY = "copyEdit.agentId";

export type CopyEditStatus = "idle" | "preparing" | "ready" | "running" | "error";

/**
 * What the editor held immediately before a copy-edit overwrote it, so the
 * rewrite can be undone. `html` is empty for adapters without `getHTML`
 * (textarea/input), where `text` is the whole story.
 */
export interface CopyEditSnapshot {
  html: string;
  text: string;
}

interface CopyEditState {
  status: CopyEditStatus;
  error?: string;
  /** True when the last copy-edit returned text identical to the input. */
  noChange: boolean;
  /**
   * Set only while a completed copy-edit is still revertible. Presence of this
   * is what makes the revert affordance appear, so it's cleared on revert and
   * at the start of each run — never left pointing at a state older than the
   * most recent successful rewrite.
   */
  undo?: CopyEditSnapshot;
}

let client: CortiClient | null = null;
let lastRefresh: CortiAuth.AuthTokenDerivable["refreshAccessToken"] | null = null;
let lastEnv: CortiSdkEnvironment | null = null;
let namespace = "default";
let store: ConfigStore = createLocalConfigStore(namespace);
let agentId: string | null = null;

/** The prompt callers want installed; "" until one has been pushed. */
let desiredPrompt = "";
/**
 * The prompt we last successfully wrote to the remote agent, or null when it's
 * unknown — after `ensureAgent` reused an agent created in an earlier session,
 * its systemPrompt could be anything, so we must not assume it.
 */
let installedPrompt: string | null = null;
/** Serializes prompt syncs so two overlapping changes can't interleave. */
let syncChain: Promise<void> = Promise.resolve();

let state: CopyEditState = {
  status: "idle",
  noChange: false,
};
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (patch: Partial<CopyEditState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => {
    l();
  });
};

const spec = (systemPrompt: string): AgentSpec => ({
  ...COPY_EDIT_AGENT,
  systemPrompt,
});

/**
 * Bring the remote agent in line with `desiredPrompt`: create it if needed, then
 * update its systemPrompt unless we know that prompt is already installed.
 *
 * The update after a fresh `ensureAgent` is deliberately unconditional.
 * `ensureAgent` finds an agent by NAME and returns it as-is, so a "Copy Editor"
 * left over from an earlier session — or from a different prompt in this
 * library — carries whatever systemPrompt it was created with. Skipping the
 * update would silently copy-edit with the wrong prompt, in the wrong language.
 */
async function syncPrompt() {
  if (!client || !desiredPrompt) {
    return;
  }
  const target = desiredPrompt;
  if (!agentId) {
    set({ status: "preparing", error: undefined });
    agentId = await ensureAgent(client, spec(target));
    store.set(AGENT_ID_KEY, agentId);
    installedPrompt = null;
  }
  if (installedPrompt === target) {
    if (state.status === "idle") {
      set({ status: "ready" });
    }
    return;
  }
  set({ status: "preparing", error: undefined });
  await client.agents.update(agentId, { systemPrompt: target });
  installedPrompt = target;
  set({ status: "ready" });
}

/** Queue a sync behind any in-flight one; failures surface as agent errors. */
function queueSync(): Promise<void> {
  syncChain = syncChain.then(syncPrompt).catch((e: unknown) => {
    set({ status: "error", error: describeAgentError(e) });
  });
  return syncChain;
}

/**
 * Install `systemPrompt` on the agent. Called whenever the active library entry
 * changes — a different dictation language, a different pin, or an edit to the
 * prompt currently in use — so the round-trip happens while the user is still
 * dictating rather than on the critical path of a cleanup run.
 */
export function setActivePrompt(systemPrompt: string) {
  if (!systemPrompt || systemPrompt === desiredPrompt) {
    return;
  }
  desiredPrompt = systemPrompt;
  void queueSync();
}

/** Wire auth + identity into the store. */
export function configureCopyEdit(
  authConfig: CortiAuth.AuthTokenDerivable,
  environment: CortiSdkEnvironment,
  clientId?: string,
  tenant?: string,
) {
  if (
    authConfig.refreshAccessToken !== lastRefresh ||
    environment.base !== lastEnv?.base ||
    environment.wss !== lastEnv?.wss ||
    environment.login !== lastEnv?.login ||
    environment.agents !== lastEnv?.agents
  ) {
    lastRefresh = authConfig.refreshAccessToken;
    lastEnv = environment;
    // REST (agents) is proxied via `environment`; WS stays direct.
    client = new CortiClient({ environment, auth: authConfig });
  }
  const ns = identityNamespace(clientId, tenant);
  if (ns !== namespace) {
    namespace = ns;
    store = createLocalConfigStore(ns);
    agentId = store.get<string>(AGENT_ID_KEY, "") || null;
    // A different tenant's agent knows nothing of the prompt we had installed.
    installedPrompt = null;
    set({ status: "idle", error: undefined, undo: undefined });
  }
  if (client) {
    void queueSync();
  }
}

/**
 * Read the whole document as text, preferring the line-break-preserving path.
 * Falls back to `getText` only for an adapter that predates `getPlainText`.
 */
function readAll(adapter: EditorAdapter): string {
  return adapter.getPlainText?.() ?? adapter.getText();
}

/** Replace the whole document, rendering newlines as real line breaks. */
function writeAll(adapter: EditorAdapter, text: string) {
  if (adapter.setPlainText) {
    adapter.setPlainText(text);
    return;
  }
  adapter.replaceRange(0, adapter.getText().length, text);
}

/** Send the editor's text to the agent and replace it with the result. */
export async function runCopyEdit(adapter: EditorAdapter) {
  // getPlainText, NOT getText: `getText()` reads `textContent`, where a `<br>`
  // contributes no newline, so the document reached the agent as one flattened
  // run of text. The prompt's "preserve line breaks" was being honoured — there
  // were simply no line breaks left in the input to preserve.
  const text = readAll(adapter);
  if (!text.trim()) {
    set({ error: "Nothing to copy-edit — dictate or type some text first." });
    return;
  }
  if (!client) {
    return;
  }
  if (!desiredPrompt) {
    set({
      error: "No cleanup prompt selected — add one in the cleanup panel.",
    });
    return;
  }
  // Drop any previous snapshot up front: if this run fails, a stale one would
  // revert past edits the user made since the last successful cleanup.
  set({
    status: "running",
    error: undefined,
    noChange: false,
    undo: undefined,
  });
  try {
    // Normally a no-op — setActivePrompt already pushed this prompt when the
    // selection changed. It matters when that push failed or is still in
    // flight: running with the previous prompt installed would copy-edit
    // against the wrong instructions, so wait for the agent to catch up.
    await queueSync();
    if (!agentId || installedPrompt !== desiredPrompt) {
      // syncPrompt failed and has already set the error/status.
      return;
    }
    set({ status: "running" });
    let corrected = "";
    try {
      corrected = await sendAgentMessage(client, agentId, text);
    } catch (e) {
      if (/404|not.?found/i.test(String(e))) {
        // The agent was deleted server-side; recreate it with the live prompt.
        agentId = await ensureAgent(client, spec(desiredPrompt));
        store.set(AGENT_ID_KEY, agentId);
        // ensureAgent may have handed back an agent it found rather than one it
        // created, whose systemPrompt is then unknown — write ours over it.
        await client.agents.update(agentId, { systemPrompt: desiredPrompt });
        installedPrompt = desiredPrompt;
        corrected = await sendAgentMessage(client, agentId, text);
      } else {
        throw e;
      }
    }
    if (corrected) {
      // Snapshot what's about to be overwritten, not what was read before the
      // request: the user can keep typing during the round-trip, and
      // replaceRange below spans the CURRENT content, so anything they added
      // mid-run is part of what revert has to put back.
      const undo: CopyEditSnapshot = {
        html: adapter.getHTML?.() ?? "",
        text: readAll(adapter),
      };
      // Always write back the returned text — when the agent makes no edits it
      // returns the text unchanged, so the user's content is preserved either way.
      writeAll(adapter, corrected);
      set({
        status: "ready",
        noChange: corrected.trim() === text.trim(),
        undo,
      });
    } else {
      // Defensive: an empty response must NOT wipe the editor.
      set({
        status: "ready",
        noChange: true,
        error: "Agent returned no text; your content was left unchanged.",
      });
    }
  } catch (e) {
    set({ status: "error", error: describeAgentError(e) });
  }
}

/**
 * Put back what the last copy-edit overwrote. One-shot: the snapshot is
 * consumed, so the button disappears rather than toggling the rewrite back on.
 *
 * Restores markup when the adapter supports it — the rewrite goes in as plain
 * text, so a text-only restore would silently drop formatting the user had
 * before running cleanup.
 */
export function revertCopyEdit(adapter: EditorAdapter) {
  const snapshot = state.undo;
  if (!snapshot) {
    return;
  }
  if (snapshot.html && adapter.setHTML) {
    adapter.setHTML(snapshot.html);
  } else {
    writeAll(adapter, snapshot.text);
  }
  set({ undo: undefined, noChange: false, error: undefined });
}

/** Forget the snapshot — for when the editor's content is discarded anyway. */
export function clearCopyEditUndo() {
  if (state.undo) {
    set({ undo: undefined });
  }
}

export function useCopyEditStore(): CopyEditState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
