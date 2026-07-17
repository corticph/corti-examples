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
  sendAgentMessageWithContext,
} from "../_shared/cortiAgent";
import type { CortiSdkEnvironment } from "../_shared/useCortiAccessToken";
import { DEFAULT_PRESET_KEY, VOICE_PRESETS, type VoiceMessage, type VoiceStatus } from "./model";

export const VOICE_AGENT = {
  name: "Voice Agent",
  description: "Real-time conversational voice agent with speculative prefetch.",
};

const PROMPT_KEY = "voiceAgent.systemPrompt";
const PRESET_KEY = "voiceAgent.presetKey";
const AGENT_ID_KEY = "voiceAgent.agentId";
const DEBOUNCE_KEY = "voiceAgent.responseDebounceMs";
const PROVISIONAL_KEY = "voiceAgent.showProvisionalDetails";

export const DEFAULT_DEBOUNCE_MS = 1500;

interface VoiceAgentState {
  status: VoiceStatus;
  messages: VoiceMessage[];
  interimText: string;
  // Speculative: stateless prefetch for display speed; always replaced by the real contextual response
  heldResponse: string | null;
  isSpeculating: boolean;
  // ID of the provisional agent message currently being replaced in-place by the real response
  pendingAgentMsgId: string | null;
  contextId: string | null;
  prompt: string;
  presetKey: string;
  // How long to wait after isFinal=true before firing the agent (ms)
  responseDebounceMs: number;
  // Specialist key detected by the orchestrator from the latest response [MODE:key] tag
  detectedMode: string | null;
  // When false (default), pending bubbles show "Responding…" instead of the raw speculative text
  showProvisionalDetails: boolean;
  error?: string;
}

let client: CortiClient | null = null;
let lastAuth: CortiAuth.AuthTokenDerivable | null = null;
let namespace = "default";
let store: ConfigStore = createLocalConfigStore(namespace);
let agentId: string | null = null;
let preparedFor: string | null = null;

// One speculative call per user turn — stateless so it never touches the real thread
let speculativeSeq = 0;
let speculativeTimer: ReturnType<typeof setTimeout> | null = null;
let speculativeFiredThisTurn = false;

const defaultPreset = VOICE_PRESETS[DEFAULT_PRESET_KEY];

let state: VoiceAgentState = {
  status: "idle",
  messages: [],
  interimText: "",
  heldResponse: null,
  isSpeculating: false,
  pendingAgentMsgId: null,
  contextId: null,
  prompt: defaultPreset.prompt,
  presetKey: DEFAULT_PRESET_KEY,
  responseDebounceMs: DEFAULT_DEBOUNCE_MS,
  detectedMode: null,
  showProvisionalDetails: false,
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
const set = (patch: Partial<VoiceAgentState>) => {
  state = { ...state, ...patch };
  emit();
};

const spec = (): AgentSpec => ({
  ...VOICE_AGENT,
  systemPrompt: state.prompt,
});

// Strips the [MODE:key] prefix the orchestrator includes at the start of every response.
// Returns the detected key (or null) and the clean display text.
function extractMode(text: string): { mode: string | null; cleanText: string } {
  const match = text.match(/^\[MODE:([^\]]+)\]\n?/);
  if (!match) {
    return { mode: null, cleanText: text };
  }
  return { mode: match[1], cleanText: text.slice(match[0].length).trim() };
}

function loadStateFromStore() {
  const storedPresetKey = store.get<string>(PRESET_KEY, DEFAULT_PRESET_KEY) || DEFAULT_PRESET_KEY;
  const presetDefault = VOICE_PRESETS[storedPresetKey]?.prompt ?? defaultPreset.prompt;
  state = {
    ...state,
    prompt: store.get<string>(PROMPT_KEY, "") || presetDefault,
    presetKey: storedPresetKey,
    responseDebounceMs: store.get<number>(DEBOUNCE_KEY, DEFAULT_DEBOUNCE_MS) || DEFAULT_DEBOUNCE_MS,
    showProvisionalDetails: store.get<boolean>(PROVISIONAL_KEY, false) || false,
    interimText: "",
    heldResponse: null,
    isSpeculating: false,
    pendingAgentMsgId: null,
    detectedMode: null,
    error: undefined,
  };
}

export function setResponseDebounceMs(ms: number) {
  store.set(DEBOUNCE_KEY, ms);
  set({ responseDebounceMs: ms });
}

export function setShowProvisionalDetails(val: boolean) {
  store.set(PROVISIONAL_KEY, val);
  set({ showProvisionalDetails: val });
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

export function configureVoiceAgent(
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

export async function applyPreset(presetKey: string) {
  const preset = VOICE_PRESETS[presetKey];
  if (!preset) {
    return;
  }
  store.set(PRESET_KEY, presetKey);
  set({ presetKey });
  await savePrompt(preset.prompt);
}

function cancelSpeculative() {
  if (speculativeTimer) {
    clearTimeout(speculativeTimer);
    speculativeTimer = null;
  }
  speculativeSeq++;
  speculativeFiredThisTurn = false;
}

// Stateless prefetch — no contextId so the real thread is never touched.
// The held response is shown immediately on final, then replaced by the real contextual response.
async function fireSpeculative(text: string) {
  if (!client || !agentId) {
    return;
  }
  const seq = ++speculativeSeq;
  set({ isSpeculating: true });
  try {
    const result = await sendAgentMessage(client, agentId, text);
    if (seq !== speculativeSeq) {
      return;
    }
    const { cleanText } = extractMode(result);
    set({ heldResponse: cleanText, isSpeculating: false });
  } catch {
    if (seq === speculativeSeq) {
      set({ isSpeculating: false });
    }
  }
}

function scheduleSpeculative(text: string) {
  // Fire once per turn — additional interims don't retrigger, keeping held response stable
  if (speculativeFiredThisTurn) {
    return;
  }
  if (speculativeTimer) {
    clearTimeout(speculativeTimer);
  }
  speculativeTimer = setTimeout(() => {
    speculativeTimer = null;
    speculativeFiredThisTurn = true;
    void fireSpeculative(text);
  }, 200);
}

export function handleInterim(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return;
  }
  set({ interimText: normalized, error: undefined });
  scheduleSpeculative(normalized);
}

export async function handleFinal(text: string) {
  if (state.status === "thinking" || state.status === "preparing") {
    return;
  }

  const normalized = text.trim();
  if (!normalized) {
    set({ interimText: "" });
    return;
  }

  cancelSpeculative();

  const held = state.heldResponse;

  if (held) {
    // Show provisional response immediately, then fire the real contextual to replace it.
    // The real response uses the correct final text and full thread context.
    const provisionalId = crypto.randomUUID();
    state = {
      ...state,
      messages: [
        ...state.messages,
        { id: crypto.randomUUID(), role: "user", text: normalized, at: Date.now() },
        { id: provisionalId, role: "assistant", text: held, at: Date.now(), pending: true },
      ],
      interimText: "",
      heldResponse: null,
      isSpeculating: false,
      pendingAgentMsgId: provisionalId,
      status: "responding",
      error: undefined,
    };
    emit();
    await replaceProvisional(normalized, provisionalId);
  } else {
    // No held response — add user message, show thinking, fire contextual
    state = {
      ...state,
      messages: [
        ...state.messages,
        { id: crypto.randomUUID(), role: "user", text: normalized, at: Date.now() },
      ],
      interimText: "",
      heldResponse: null,
      isSpeculating: false,
      pendingAgentMsgId: null,
      status: "thinking",
      error: undefined,
    };
    emit();
    await sendContextual(normalized);
  }
}

// Fires the real contextual request and updates the provisional message in-place.
async function replaceProvisional(text: string, pendingId: string) {
  if (!client || !agentId) {
    state = {
      ...state,
      messages: state.messages.map((m) => (m.id === pendingId ? { ...m, pending: false } : m)),
      pendingAgentMsgId: null,
      status: "ready",
    };
    emit();
    return;
  }
  try {
    let result: Awaited<ReturnType<typeof sendAgentMessageWithContext>> | undefined;
    try {
      result = await sendAgentMessageWithContext(client, agentId, text, {
        contextId: state.contextId || undefined,
      });
    } catch (error) {
      if (/404|not.?found/i.test(String(error))) {
        agentId = await ensureAgent(client, spec());
        store.set(AGENT_ID_KEY, agentId);
        result = await sendAgentMessageWithContext(client, agentId, text);
      } else {
        throw error;
      }
    }

    const { mode, cleanText } = extractMode(result.text.trim());
    const responseText = cleanText || "(no response)";
    state = {
      ...state,
      messages: state.messages.map((m) =>
        m.id === pendingId ? { ...m, text: responseText, pending: false } : m,
      ),
      contextId: result.contextId ?? state.contextId,
      detectedMode: mode ?? state.detectedMode,
      pendingAgentMsgId: null,
      status: "ready",
    };
    emit();
  } catch (error) {
    // Clear pending indicator, keep the provisional text visible, surface the error
    state = {
      ...state,
      messages: state.messages.map((m) => (m.id === pendingId ? { ...m, pending: false } : m)),
      pendingAgentMsgId: null,
      status: "error",
      error: describeAgentError(error),
    };
    emit();
  }
}

// Fallback path — no speculative was ready; fires contextual directly and adds the response.
async function sendContextual(text: string) {
  if (!client || !agentId) {
    set({ status: "ready" });
    return;
  }
  try {
    let result: Awaited<ReturnType<typeof sendAgentMessageWithContext>> | undefined;
    try {
      result = await sendAgentMessageWithContext(client, agentId, text, {
        contextId: state.contextId || undefined,
      });
    } catch (error) {
      if (/404|not.?found/i.test(String(error))) {
        agentId = await ensureAgent(client, spec());
        store.set(AGENT_ID_KEY, agentId);
        result = await sendAgentMessageWithContext(client, agentId, text);
      } else {
        throw error;
      }
    }

    const { mode, cleanText } = extractMode(result.text.trim());
    const responseText = cleanText || "(no response)";
    state = {
      ...state,
      messages: [
        ...state.messages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: responseText,
          at: Date.now(),
        },
      ],
      contextId: result.contextId ?? state.contextId,
      detectedMode: mode ?? state.detectedMode,
      status: "ready",
    };
    emit();
  } catch (error) {
    set({ status: "error", error: describeAgentError(error) });
  }
}

export async function resetConversation() {
  cancelSpeculative();
  const currentAgentId = agentId;
  const currentContextId = state.contextId;
  let resetError: string | undefined;
  set({ status: "preparing", error: undefined });

  try {
    if (client && currentAgentId && currentContextId) {
      await client.agents.deleteContext(currentAgentId, currentContextId);
    }
  } catch (error) {
    if (!/404|not.?found/i.test(String(error))) {
      resetError = describeAgentError(error);
    }
  }

  state = {
    ...state,
    messages: [],
    interimText: "",
    heldResponse: null,
    isSpeculating: false,
    pendingAgentMsgId: null,
    contextId: null,
    detectedMode: null,
    status: client ? "ready" : "idle",
    error: resetError,
  };
  emit();
}

export function useVoiceAgentStore(): VoiceAgentState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
