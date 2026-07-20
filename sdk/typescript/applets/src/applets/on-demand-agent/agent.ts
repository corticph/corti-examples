/**
 * Store + agent wiring for the on-demand agent applet. Holds the (editable,
 * persisted) system prompt, the agent status, and the run logic — shared between
 * the body (dictation + copy-edit) and the details card (prompt editor) via
 * useSyncExternalStore.
 *
 * The copy-editor agent is created on first use if absent (cached per API
 * client). Editing the prompt updates the agent in place. Behavior lives
 * entirely in the system prompt: a MINIMAL spelling/grammar/punctuation pass
 * that preserves wording and content.
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

export const DEFAULT_PROMPT = `You are a meticulous copy editor for dictated clinical text.
Apply ONLY the minimal spelling, grammar, capitalization, spacing, and punctuation corrections needed to make the text readable and adherent to standard written conventions.
Do NOT reword, rephrase, summarize, expand, or remove content. Do NOT change clinical meaning, numbers, units, medication names, or the author's vocabulary and style.
Preserve line breaks and overall structure.
Return ONLY the corrected text — no commentary, preamble, labels, or quotation marks.`;

export const COPY_EDIT_COMMAND_ID = "copy_edit";
const PROMPT_KEY = "copyEdit.systemPrompt";
const AGENT_ID_KEY = "copyEdit.agentId";

export type CopyEditStatus = "idle" | "preparing" | "ready" | "running" | "error";

interface CopyEditState {
  prompt: string;
  status: CopyEditStatus;
  error?: string;
  /** True when the last copy-edit returned text identical to the input. */
  noChange: boolean;
}

let client: CortiClient | null = null;
let lastAuth: CortiAuth.AuthTokenDerivable | null = null;
let namespace = "default";
let store: ConfigStore = createLocalConfigStore(namespace);
let agentId: string | null = null;
let preparedFor: string | null = null;

let state: CopyEditState = {
  prompt: DEFAULT_PROMPT,
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
  // biome-ignore lint/suspicious/useIterableCallbackReturn: forEach notify callbacks are intentionally void
  listeners.forEach((l) => l());
};

const spec = (): AgentSpec => ({
  ...COPY_EDIT_AGENT,
  systemPrompt: state.prompt,
});

async function prepare() {
  if (!client) {
    return;
  }
  set({ status: "preparing", error: undefined });
  try {
    if (!agentId) {
      agentId = await ensureAgent(client, spec());
      store.set(AGENT_ID_KEY, agentId);
    }
    set({ status: "ready" });
  } catch (e) {
    set({ status: "error", error: describeAgentError(e) });
  }
}

/** Wire auth + identity into the store; prepares the agent once per API client. */
export function configureCopyEdit(
  authConfig: CortiAuth.AuthTokenDerivable,
  environment: CortiSdkEnvironment,
  clientId?: string,
  tenant?: string,
) {
  if (authConfig !== lastAuth) {
    lastAuth = authConfig;
    // REST (agents) is proxied via `environment`; WS stays direct.
    client = new CortiClient({ environment, auth: authConfig });
  }
  const ns = identityNamespace(clientId, tenant);
  if (ns !== namespace) {
    namespace = ns;
    store = createLocalConfigStore(ns);
    agentId = store.get<string>(AGENT_ID_KEY, "") || null;
    preparedFor = null;
    set({ prompt: store.get<string>(PROMPT_KEY, "") || DEFAULT_PROMPT });
  }
  if (client && preparedFor !== namespace) {
    preparedFor = namespace;
    void prepare();
  }
}

/** Persist a new system prompt and update the agent in place. */
export async function savePrompt(prompt: string) {
  store.set(PROMPT_KEY, prompt);
  set({ prompt });
  if (!client || !agentId) {
    return;
  }
  set({ status: "preparing", error: undefined });
  try {
    await client.agents.update(agentId, { systemPrompt: prompt });
    set({ status: "ready" });
  } catch (e) {
    set({ status: "error", error: describeAgentError(e) });
  }
}

export const resetPrompt = () => savePrompt(DEFAULT_PROMPT);

export function exportAgent() {
  const payload = { agent: { ...COPY_EDIT_AGENT, systemPrompt: state.prompt } };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "corti-copy-edit-agent.json";
  a.click();
  URL.revokeObjectURL(url);
}

/** Send the editor's text to the agent and replace it with the result. */
export async function runCopyEdit(adapter: EditorAdapter) {
  const text = adapter.getText();
  if (!text.trim()) {
    set({ error: "Nothing to copy-edit — dictate or type some text first." });
    return;
  }
  if (!client) {
    return;
  }
  set({ status: "running", error: undefined, noChange: false });
  try {
    if (!agentId) {
      agentId = await ensureAgent(client, spec());
      store.set(AGENT_ID_KEY, agentId);
    }
    let corrected = "";
    try {
      corrected = await sendAgentMessage(client, agentId, text);
    } catch (e) {
      if (/404|not.?found/i.test(String(e))) {
        agentId = await ensureAgent(client, spec());
        store.set(AGENT_ID_KEY, agentId);
        corrected = await sendAgentMessage(client, agentId, text);
      } else {
        throw e;
      }
    }
    if (corrected) {
      // Always write back the returned text — when the agent makes no edits it
      // returns the text unchanged, so the user's content is preserved either way.
      adapter.replaceRange(0, adapter.getText().length, corrected);
      set({ status: "ready", noChange: corrected.trim() === text.trim() });
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

export function useCopyEditStore(): CopyEditState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
