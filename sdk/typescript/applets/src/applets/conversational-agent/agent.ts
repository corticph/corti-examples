import type { Corti, CortiAuth } from "@corti/sdk";
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
  sendAgentMessageWithContext,
} from "../_shared/cortiAgent";
import type { CortiSdkEnvironment } from "../_shared/useCortiAccessToken";
import {
  appendDebugEntry,
  type ConversationMessage,
  type ConversationSource,
  clearConversationState,
  type DebugEntry,
  extractWakeIntent,
} from "./model";

export const CONVERSATIONAL_AGENT = {
  name: "Conversational Clinical Agent",
  description:
    "Conversational clinical assistant with wake-command gated voice input and threaded memory.",
};

export const DEFAULT_PROMPT = `You are a real-time conversational clinical agent.
Provide concise, clinically appropriate responses for a healthcare professional using the app.
Maintain conversational memory within the current thread so follow-up questions stay grounded in prior turns.
Do not claim actions you did not perform. If information is missing or uncertain, say so plainly.
Respond in clear professional language. Prefer short paragraphs or brief lists when they improve readability.
Do not add boilerplate disclaimers unless the user asks for medical advice that requires caution.`;

const PROMPT_KEY = "conversationalAgent.systemPrompt";
const AGENT_ID_KEY = "conversationalAgent.agentId";
const AUTO_SEND_KEY = "conversationalAgent.autoSend";
const CONTEXT_ID_KEY = "conversationalAgent.contextId";
const MESSAGES_KEY = "conversationalAgent.messages";

export type ConversationStatus = "idle" | "preparing" | "ready" | "running" | "resetting" | "error";

interface ConversationState {
  prompt: string;
  status: ConversationStatus;
  error?: string;
  messages: ConversationMessage[];
  composer: string;
  autoSend: boolean;
  debugLog: DebugEntry[];
  contextId: string | null;
}

let client: CortiClient | null = null;
let lastAuth: CortiAuth.AuthTokenDerivable | null = null;
let namespace = "default";
let store: ConfigStore = createLocalConfigStore(namespace);
let agentId: string | null = null;
let preparedFor: string | null = null;

let state: ConversationState = {
  prompt: DEFAULT_PROMPT,
  status: "idle",
  messages: [],
  composer: "",
  autoSend: true,
  debugLog: [],
  contextId: null,
};

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};
const set = (patch: Partial<ConversationState>) => {
  state = { ...state, ...patch };
  emit();
};

const spec = (): AgentSpec => ({
  ...CONVERSATIONAL_AGENT,
  systemPrompt: state.prompt,
});

function persistConversationData() {
  store.set(PROMPT_KEY, state.prompt);
  store.set(AUTO_SEND_KEY, state.autoSend);
  store.set(CONTEXT_ID_KEY, state.contextId);
  store.set(MESSAGES_KEY, state.messages);
}

function loadStateFromStore() {
  state = {
    ...state,
    prompt: store.get<string>(PROMPT_KEY, "") || DEFAULT_PROMPT,
    autoSend: store.get<boolean>(AUTO_SEND_KEY, true),
    contextId: store.get<string | null>(CONTEXT_ID_KEY, null),
    messages: store.get<ConversationMessage[]>(MESSAGES_KEY, []),
    composer: "",
    debugLog: [],
    error: undefined,
  };
}

function appendMessage(role: "user" | "assistant", text: string, source: ConversationSource) {
  state = {
    ...state,
    messages: [
      ...state.messages,
      {
        id: crypto.randomUUID(),
        role,
        text,
        source,
        at: Date.now(),
      },
    ],
  };
  persistConversationData();
  emit();
}

function logDebug(entry: Omit<DebugEntry, "id" | "at">) {
  state = {
    ...state,
    debugLog: appendDebugEntry(state.debugLog, entry),
  };
  emit();
}

function isBusy(status: ConversationStatus) {
  return status === "running" || status === "resetting";
}

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
  } catch (error) {
    set({ status: "error", error: describeAgentError(error) });
  }
}

export function configureConversation(
  authConfig: CortiAuth.AuthTokenDerivable,
  environment: CortiSdkEnvironment,
  clientId?: string,
  tenant?: string,
) {
  if (authConfig !== lastAuth) {
    lastAuth = authConfig;
    client = new CortiClient({ environment, auth: authConfig });
  }

  const nextNamespace = identityNamespace(clientId, tenant);
  if (nextNamespace !== namespace) {
    namespace = nextNamespace;
    store = createLocalConfigStore(nextNamespace);
    agentId = store.get<string>(AGENT_ID_KEY, "") || null;
    preparedFor = null;
    loadStateFromStore();
    emit();
  }

  if (client && preparedFor !== namespace) {
    preparedFor = namespace;
    void prepare();
  }
}

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
  } catch (error) {
    set({ status: "error", error: describeAgentError(error) });
  }
}

export const resetPrompt = () => savePrompt(DEFAULT_PROMPT);

export function setComposer(text: string) {
  set({ composer: text, error: undefined });
}

export function setAutoSend(autoSend: boolean) {
  state = { ...state, autoSend };
  persistConversationData();
  emit();
}

export function clearConversationError() {
  if (!state.error) {
    return;
  }
  set({ error: undefined });
}

export function logFinalTranscript(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return;
  }
  logDebug({ type: "transcript", text: normalized });
}

export function logWakeCommand(command: Corti.TranscribeCommandData) {
  logDebug({
    type: "command",
    text: command.rawTranscriptText.trim(),
    variables: command.variables,
  });
}

export function clearDebugLog() {
  set({ debugLog: [] });
}

export async function sendText(text: string, source: ConversationSource): Promise<boolean> {
  const normalized = text.trim();
  if (!normalized) {
    set({ error: "Nothing to send yet." });
    return false;
  }
  if (!client) {
    return false;
  }
  if (isBusy(state.status)) {
    set({ error: "Wait for the current response before sending another turn." });
    return false;
  }

  set({ status: "running", error: undefined, composer: "" });
  appendMessage("user", normalized, source);

  try {
    if (!agentId) {
      agentId = await ensureAgent(client, spec());
      store.set(AGENT_ID_KEY, agentId);
    }

    let retriedWithoutContext = false;
    // biome-ignore lint/suspicious/noImplicitAnyLet: typed by the awaited assignment below
    let result;

    try {
      result = await sendAgentMessageWithContext(client, agentId, normalized, {
        contextId: state.contextId || undefined,
      });
    } catch (error) {
      if (/404|not.?found/i.test(String(error))) {
        agentId = await ensureAgent(client, spec());
        store.set(AGENT_ID_KEY, agentId);
        retriedWithoutContext = Boolean(state.contextId);
        result = await sendAgentMessageWithContext(client, agentId, normalized);
      } else {
        throw error;
      }
    }

    const responseText = result.text.trim();
    if (!responseText) {
      set({
        status: "ready",
        error: "Agent returned no text; the conversation was left unchanged.",
      });
      return true;
    }

    state = {
      ...state,
      contextId: result.contextId ?? state.contextId,
    };
    appendMessage("assistant", responseText, "typed");
    persistConversationData();
    set({
      status: "ready",
      contextId: result.contextId ?? state.contextId,
      error: retriedWithoutContext
        ? "The saved thread was unavailable on the server, so a new one was started for this turn."
        : undefined,
    });
    return true;
  } catch (error) {
    set({ status: "error", error: describeAgentError(error) });
    return false;
  }
}

export async function sendComposer(): Promise<boolean> {
  return sendText(state.composer, "typed");
}

export async function handleWakeCommand(command: Corti.TranscribeCommandData): Promise<void> {
  const intent = extractWakeIntent(command);
  if (!intent) {
    set({
      error: 'Wake phrase recognized, but no intent was captured after "Corti".',
    });
    return;
  }

  if (state.autoSend) {
    const sent = await sendText(intent, "voice");
    if (!sent) {
      setComposer(intent);
    }
    return;
  }

  setComposer(intent);
}

export async function resetConversation() {
  const currentAgentId = agentId;
  const currentContextId = state.contextId;
  let resetError: string | undefined;
  set({ status: "resetting", error: undefined });

  try {
    if (client && currentAgentId && currentContextId) {
      await client.agents.deleteContext(currentAgentId, currentContextId);
    }
  } catch (error) {
    if (!/404|not.?found/i.test(String(error))) {
      resetError = describeAgentError(error);
    }
  }

  state = clearConversationState({
    ...state,
    status: client ? "ready" : "idle",
    prompt: state.prompt,
    autoSend: state.autoSend,
  });
  persistConversationData();
  set({ status: client ? "ready" : "idle", error: resetError });
}

export function useConversationStore(): ConversationState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
