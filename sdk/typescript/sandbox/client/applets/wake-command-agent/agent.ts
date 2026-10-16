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
  streamAgentMessageWithContext,
} from "../_shared/cortiAgent";
import { EXAMPLES_ANALYTICS } from "../_shared/examplesAnalytics";
import type { CortiSdkEnvironment } from "../_shared/useCortiAccessToken";
import {
  appendDebugEntry,
  type ConversationMessage,
  type ConversationSource,
  clearConversationState,
  type DebugEntry,
  extractWakeIntent,
} from "./model";

export const WAKE_COMMAND_AGENT = {
  name: "Wake-command Clinical Agent",
  description: "Wake-command gated clinical agent with threaded memory.",
};

export const DEFAULT_PROMPT = `You are a real-time conversational clinical agent.
Provide concise, clinically appropriate responses for a healthcare professional using the app.
Maintain conversational memory within the current thread so follow-up questions stay grounded in prior turns.
Do not claim actions you did not perform. If information is missing or uncertain, say so plainly.
Respond in clear professional language. Prefer short paragraphs or brief lists when they improve readability.
Maximum 2-3 sentences per response unless the user asks for detail.
Do not add boilerplate disclaimers unless the user asks for medical advice that requires caution.`;

const PROMPT_KEY = "wakeCommandAgent.systemPrompt";
const AGENT_ID_KEY = "wakeCommandAgent.agentId";
const AUTO_SEND_KEY = "wakeCommandAgent.autoSend";
const CONTEXT_ID_KEY = "wakeCommandAgent.contextId";
const MESSAGES_KEY = "wakeCommandAgent.messages";

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
let lastRefresh: CortiAuth.AuthTokenDerivable["refreshAccessToken"] | null = null;
let lastEnv: CortiSdkEnvironment | null = null;
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
  ...WAKE_COMMAND_AGENT,
  systemPrompt: state.prompt,
  model: "corti-s1-mini",
  lifecycle: "persistent",
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
  if (
    authConfig.refreshAccessToken !== lastRefresh ||
    environment.base !== lastEnv?.base ||
    environment.wss !== lastEnv?.wss ||
    environment.login !== lastEnv?.login ||
    environment.agents !== lastEnv?.agents
  ) {
    lastRefresh = authConfig.refreshAccessToken;
    lastEnv = environment;
    client = new CortiClient({ environment, auth: authConfig, analytics: EXAMPLES_ANALYTICS });
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
    void prepare().then(() => logSessionConfig());
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
    await client.agentic.agents.update(agentId, { systemPrompt: prompt });
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
  logDebug({ type: "final-transcript", text: normalized });
}

export function logInterimTranscript(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return;
  }
  logDebug({ type: "interim-transcript", text: normalized });
}

export function logWakeCommand(command: Corti.TranscribeCommandData) {
  logDebug({
    type: "command",
    text: command.rawTranscriptText.trim(),
    data: { variables: command.variables },
  });
}

export function logSessionConfig() {
  logDebug({
    type: "session-config",
    text: `Model: corti-s1-mini, Lifecycle: persistent`,
    data: {
      agentName: WAKE_COMMAND_AGENT.name,
      model: "corti-s1-mini",
      lifecycle: "persistent",
      autoSend: state.autoSend,
      contextId: state.contextId,
      promptPreview: state.prompt.slice(0, 200),
    },
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
    set({
      error: "Wait for the current response before sending another turn.",
    });
    return false;
  }

  set({ status: "running", error: undefined, composer: "" });
  appendMessage("user", normalized, source);

  const assistantId = crypto.randomUUID();

  try {
    if (!agentId) {
      agentId = await ensureAgent(client, spec());
      store.set(AGENT_ID_KEY, agentId);
    }

    // Create a pending assistant message that will grow as chunks arrive.
    state = {
      ...state,
      messages: [
        ...state.messages,
        {
          id: assistantId,
          role: "assistant",
          text: "",
          source: "typed",
          at: Date.now(),
        },
      ],
    };
    emit();

    let accumulated = "";
    let contextId = state.contextId;
    let retriedWithoutContext = false;

    logDebug({
      type: "agent-request",
      text: normalized.slice(0, 200),
      data: { agentId, contextId, historyLength: 10, fullText: normalized },
    });

    try {
      const stream = streamAgentMessageWithContext(client, agentId, normalized, {
        contextId: contextId || undefined,
        historyLength: 10,
      });

      for await (const chunk of stream) {
        if (chunk.contextId) {
          contextId = chunk.contextId;
        }
        accumulated += chunk.delta;
        state = {
          ...state,
          messages: state.messages.map((m) =>
            m.id === assistantId ? { ...m, text: accumulated } : m,
          ),
          contextId,
        };
        emit();
      }
    } catch (error) {
      if (/404|not.?found/i.test(String(error))) {
        agentId = await ensureAgent(client, spec());
        store.set(AGENT_ID_KEY, agentId);
        retriedWithoutContext = Boolean(contextId);
        accumulated = "";
        contextId = null;

        const stream = streamAgentMessageWithContext(client, agentId, normalized, {
          historyLength: 10,
        });

        for await (const chunk of stream) {
          if (chunk.contextId) {
            contextId = chunk.contextId;
          }
          accumulated += chunk.delta;
          state = {
            ...state,
            messages: state.messages.map((m) =>
              m.id === assistantId ? { ...m, text: accumulated } : m,
            ),
            contextId,
          };
          emit();
        }
      } else {
        throw error;
      }
    }

    const responseText = accumulated.trim();
    logDebug({
      type: "agent-response",
      text: responseText.slice(0, 200) || "(empty)",
      data: {
        agentId,
        contextId,
        fullText: responseText,
        chunkCount: accumulated.length,
      },
    });

    if (!responseText) {
      state = {
        ...state,
        messages: state.messages.filter((m) => m.id !== assistantId),
      };
      set({
        status: "ready",
        error: "Agent returned no text; the conversation was left unchanged.",
      });
      return true;
    }

    state = {
      ...state,
      contextId: contextId ?? state.contextId,
    };
    persistConversationData();
    set({
      status: "ready",
      contextId: contextId ?? state.contextId,
      error: retriedWithoutContext
        ? "The saved thread was unavailable on the server, so a new one was started for this turn."
        : undefined,
    });
    return true;
  } catch (error) {
    // Remove the pending assistant message on error so it doesn't linger as
    // an empty "Assistant typed" bubble.
    state = {
      ...state,
      messages: state.messages.filter((m) => m.id !== assistantId),
    };
    const errMsg = describeAgentError(error);
    logDebug({
      type: "agent-error",
      text: errMsg,
      data: { error: String(error) },
    });
    set({ status: "error", error: errMsg });
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
  const currentContextId = state.contextId;
  let resetError: string | undefined;
  set({ status: "resetting", error: undefined });

  try {
    if (client && currentContextId) {
      await client.agentic.contexts.delete(currentContextId);
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
