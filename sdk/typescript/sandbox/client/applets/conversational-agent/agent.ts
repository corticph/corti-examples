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
  streamAgentMessageWithContext,
} from "../_shared/cortiAgent";
import { EXAMPLES_ANALYTICS } from "../_shared/examplesAnalytics";
import type { CortiSdkEnvironment } from "../_shared/useCortiAccessToken";
import { DEFAULT_PRESET_KEY, VOICE_PRESETS, type VoiceMessage, type VoiceStatus } from "./model";

export const CONVERSATIONAL_AGENT = {
  name: "Conversational Agent",
  description: "Streaming conversational agent with specialist presets and connectors.",
  model: "corti-s1",
  lifecycle: "persistent" as const,
};

const PROMPT_KEY = "conversationalAgent.systemPrompt";
const PRESET_KEY = "conversationalAgent.presetKey";
const AGENT_ID_KEY = "conversationalAgent.agentId";
const TURN_MODE_KEY = "conversationalAgent.turnMode";
const EXTERNAL_AGENT_ID_KEY = "conversationalAgent.externalAgentId";
const CONNECTORS_ENABLED_KEY = "conversationalAgent.connectorsEnabled";

export type TurnMode = "instant" | "standard" | "deliberate";
const DEFAULT_TURN_MODE: TurnMode = "standard";

export const TURN_MODE_DEBOUNCE_MS: Record<TurnMode, number> = {
  instant: 500,
  standard: 1500,
  deliberate: 1500,
};

// ─── Debug log ───────────────────────────────────────────────────────────────

export type DebugLogEventType =
  | "interim"
  | "final_flushed"
  | "turn_merged"
  | "agent_stream_start"
  | "agent_stream_chunk"
  | "agent_stream_done"
  | "agent_error"
  | "mode_detected"
  | "audio_event"
  | "session_config";

export interface DebugLogEntry {
  id: string;
  tMs: number;
  event: DebugLogEventType;
  text: string;
  fullText?: string;
  latencyMs?: number;
}

let debugLog: DebugLogEntry[] = [];
let logEpochMs: number | null = null;
const debugLogListeners = new Set<() => void>();
const emitLog = () => {
  for (const l of debugLogListeners) {
    l();
  }
};

function nowMs(): number {
  if (!logEpochMs) {
    logEpochMs = Date.now();
  }
  return Date.now() - logEpochMs;
}

function snippet(text: string, maxLen = 70): string {
  const flat = text.replace(/\n/g, " ");
  return flat.length > maxLen ? `${flat.slice(0, maxLen)}…` : flat;
}

function addLog(entry: Omit<DebugLogEntry, "id" | "tMs">) {
  const { text, ...rest } = entry;
  debugLog = [
    ...debugLog,
    {
      id: crypto.randomUUID(),
      tMs: nowMs(),
      text: snippet(text),
      fullText: text,
      ...rest,
    },
  ];
  emitLog();
}

export function useDebugLogStore(): DebugLogEntry[] {
  return useSyncExternalStore(
    (listener) => {
      debugLogListeners.add(listener);
      return () => debugLogListeners.delete(listener);
    },
    () => debugLog,
    () => debugLog,
  );
}

export function clearDebugLog() {
  logEpochMs = null;
  debugLog = [];
  emitLog();
}

function logSessionConfig() {
  const preset = VOICE_PRESETS[state.presetKey];
  addLog({
    event: "session_config",
    text: `${CONVERSATIONAL_AGENT.name} — model: ${CONVERSATIONAL_AGENT.model}, preset: ${preset.label}`,
    fullText: JSON.stringify(
      {
        agent: CONVERSATIONAL_AGENT.name,
        model: CONVERSATIONAL_AGENT.model,
        lifecycle: CONVERSATIONAL_AGENT.lifecycle,
        preset: preset.label,
        presetKey: state.presetKey,
        turnMode: state.turnMode,
        connectorsEnabled: state.connectorsEnabled,
        connectors:
          preset.connectors?.map((c) => (c as { name?: string }).name).join(", ") || "none",
        externalAgentId: state.externalAgentId || "auto-created",
        systemPromptPreview: state.prompt.slice(0, 500),
      },
      null,
      2,
    ),
  });
}

// ─── Main agent state ─────────────────────────────────────────────────────────

interface VoiceAgentState {
  status: VoiceStatus;
  messages: VoiceMessage[];
  interimText: string;
  contextId: string | null;
  prompt: string;
  presetKey: string;
  turnMode: TurnMode;
  detectedMode: string | null;
  externalAgentId: string | null;
  connectorsEnabled: boolean;
  error?: string;
}

let client: CortiClient | null = null;
let lastRefresh: CortiAuth.AuthTokenDerivable["refreshAccessToken"] | null = null;
let lastEnv: CortiSdkEnvironment | null = null;
let namespace = "default";
let store: ConfigStore = createLocalConfigStore(namespace);
let agentId: string | null = null;
let preparedFor: string | null = null;

// Incremented each time a new stream starts. A stale stream (superseded by a
// turn-merge) checks this seq and discards its result.
let streamSeq = 0;

// Timestamp of the last completed agent response. Used to detect post-response
// continuations: new speech arriving within the debounce window is treated as
// part of the same turn.
let lastResponseAt: number | null = null;

const defaultPreset = VOICE_PRESETS[DEFAULT_PRESET_KEY];

let state: VoiceAgentState = {
  status: "idle",
  messages: [],
  interimText: "",
  contextId: null,
  prompt: defaultPreset.prompt,
  presetKey: DEFAULT_PRESET_KEY,
  turnMode: DEFAULT_TURN_MODE,
  detectedMode: null,
  externalAgentId: null,
  connectorsEnabled: true,
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
  ...CONVERSATIONAL_AGENT,
  systemPrompt: state.prompt,
  connectors: state.connectorsEnabled ? VOICE_PRESETS[state.presetKey]?.connectors : undefined,
});

function extractMode(text: string): { mode: string | null; cleanText: string } {
  const match = text.match(/^\[MODE:([^\]]+)\]\n?/);
  const mode = match ? match[1] : null;
  // Strip all mode tags (leading or embedded) and collapse blank lines
  const cleanText = text
    .replace(/\[MODE:[^\]]*\]\n?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { mode, cleanText };
}

function loadStateFromStore() {
  const storedPresetKey = store.get<string>(PRESET_KEY, DEFAULT_PRESET_KEY) || DEFAULT_PRESET_KEY;
  const presetDefault = VOICE_PRESETS[storedPresetKey]?.prompt ?? defaultPreset.prompt;
  state = {
    ...state,
    prompt: store.get<string>(PROMPT_KEY, "") || presetDefault,
    presetKey: storedPresetKey,
    turnMode: (store.get<string>(TURN_MODE_KEY, "") as TurnMode) || DEFAULT_TURN_MODE,
    externalAgentId: store.get<string>(EXTERNAL_AGENT_ID_KEY, "") || null,
    connectorsEnabled: store.get<boolean>(CONNECTORS_ENABLED_KEY, true) ?? true,
    interimText: "",
    detectedMode: null,
    error: undefined,
  };
}

export function setTurnMode(mode: TurnMode) {
  store.set(TURN_MODE_KEY, mode);
  set({ turnMode: mode });
}

export function setConnectorsEnabled(val: boolean) {
  store.set(CONNECTORS_ENABLED_KEY, val);
  set({ connectorsEnabled: val });
  if (client && agentId && !state.externalAgentId) {
    void savePrompt(state.prompt);
  }
}

export function setExternalAgentId(val: string | null) {
  const normalized = val?.trim() || null;
  store.set(EXTERNAL_AGENT_ID_KEY, normalized ?? "");
  set({ externalAgentId: normalized });
  if (client) {
    void prepare();
  }
}

async function prepare() {
  if (!client) {
    return;
  }
  set({ status: "preparing", error: undefined });
  try {
    if (state.externalAgentId) {
      agentId = state.externalAgentId;
    } else if (!agentId) {
      agentId = await ensureAgent(client, spec());
      store.set(AGENT_ID_KEY, agentId);
    }
    set({ status: "ready" });
    logSessionConfig();
  } catch (error) {
    set({ status: "error", error: describeAgentError(error) });
  }
}

export function configureConversationalAgent(
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
    preparedFor = null;
    loadStateFromStore();
    agentId = state.externalAgentId || store.get<string>(AGENT_ID_KEY, "") || null;
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
  if (!client || !agentId || state.externalAgentId) {
    return;
  }

  set({ status: "preparing", error: undefined });
  try {
    await client.agentic.agents.update(agentId, {
      systemPrompt: prompt,
      connectors: spec().connectors ?? [],
    });
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
  if (state.externalAgentId) {
    return;
  }
  await savePrompt(preset.prompt);
}

export function handleAudioEvent(eventType: string) {
  addLog({ event: "audio_event", text: eventType });
}

export function handleInterim(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return;
  }
  addLog({ event: "interim", text: normalized });
  set({ interimText: normalized, error: undefined });
}

export async function handleFinal(text: string) {
  if (state.status === "preparing") {
    return;
  }

  const normalized = text.trim();
  if (!normalized) {
    set({ interimText: "" });
    return;
  }

  // Post-response continuation window: new speech arriving shortly after a
  // response is still part of the same turn.
  const timeSinceResponse = lastResponseAt != null ? Date.now() - lastResponseAt : Infinity;
  const isContinuation =
    state.status === "ready" && timeSinceResponse < TURN_MODE_DEBOUNCE_MS[state.turnMode] * 2;

  // Merge into the current turn when: (a) streaming is in flight (thinking),
  // or (b) we're within the post-response window (ready but recent).
  if (state.status === "thinking" || isContinuation) {
    // Invalidate any in-flight stream
    streamSeq++;

    const messages = [...state.messages];

    // Post-response path: remove stale trailing assistant message
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "assistant") {
      messages.pop();
    }

    // Append to the last user message (always present at this point)
    const lastUserIdx = messages.reduce((best, m, i) => (m.role === "user" ? i : best), -1);
    const mergedText =
      lastUserIdx >= 0 ? `${messages[lastUserIdx].text} ${normalized}` : normalized;
    if (lastUserIdx >= 0) {
      messages[lastUserIdx] = { ...messages[lastUserIdx], text: mergedText };
    } else {
      messages.push({
        id: crypto.randomUUID(),
        role: "user",
        text: mergedText,
        at: Date.now(),
      });
    }

    addLog({ event: "turn_merged", text: mergedText });

    state = {
      ...state,
      messages,
      interimText: "",
      status: "thinking",
      error: undefined,
    };
    emit();
    await streamResponse(mergedText);
    return;
  }

  addLog({ event: "final_flushed", text: normalized });

  state = {
    ...state,
    messages: [
      ...state.messages,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: normalized,
        at: Date.now(),
      },
    ],
    interimText: "",
    status: "thinking",
    error: undefined,
  };
  emit();
  await streamResponse(normalized);
}

async function streamResponse(text: string) {
  if (!client || !agentId) {
    set({ status: "ready" });
    return;
  }

  const mySeq = ++streamSeq;
  const firedAt = nowMs();
  addLog({ event: "agent_stream_start", text });

  const assistantId = crypto.randomUUID();
  state = {
    ...state,
    messages: [...state.messages, { id: assistantId, role: "assistant", text: "", at: Date.now() }],
  };
  emit();

  let accumulated = "";
  let contextId = state.contextId;

  try {
    const stream = streamAgentMessageWithContext(client, agentId, text, {
      contextId: contextId || undefined,
    });

    for await (const chunk of stream) {
      if (mySeq !== streamSeq) {
        addLog({
          event: "agent_stream_done",
          text: "(discarded — superseded)",
        });
        return;
      }

      if (chunk.contextId) {
        contextId = chunk.contextId;
      }

      accumulated += chunk.delta;

      const { cleanText } = extractMode(accumulated);
      addLog({ event: "agent_stream_chunk", text: chunk.delta });

      state = {
        ...state,
        messages: state.messages.map((m) => (m.id === assistantId ? { ...m, text: cleanText } : m)),
      };
      emit();
    }

    if (mySeq !== streamSeq) {
      return;
    }

    const { mode, cleanText } = extractMode(accumulated.trim());
    const responseText =
      cleanText || "Sorry, I didn't get that. Could you please restate your request?";

    addLog({
      event: "agent_stream_done",
      text: responseText,
      latencyMs: nowMs() - firedAt,
    });

    lastResponseAt = Date.now();

    if (mode && mode !== state.detectedMode) {
      addLog({ event: "mode_detected", text: mode });
    }

    state = {
      ...state,
      messages: state.messages.map((m) =>
        m.id === assistantId ? { ...m, text: responseText } : m,
      ),
      contextId: contextId ?? state.contextId,
      detectedMode: mode ?? state.detectedMode,
      status: "ready",
    };
    emit();
  } catch (error) {
    if (/404|not.?found/i.test(String(error)) && !state.externalAgentId) {
      try {
        agentId = await ensureAgent(client, spec());
        store.set(AGENT_ID_KEY, agentId);
        state = {
          ...state,
          messages: state.messages.filter((m) => m.id !== assistantId),
        };
        emit();
        await streamResponse(text);
        return;
      } catch {
        // fall through
      }
    }

    const errMsg = describeAgentError(error);
    addLog({ event: "agent_error", text: errMsg });

    if (mySeq === streamSeq) {
      state = {
        ...state,
        messages: state.messages.filter((m) => m.id !== assistantId),
        status: "error",
        error: errMsg,
      };
      emit();
    }
  }
}

export async function resetConversation() {
  streamSeq++;
  lastResponseAt = null;
  const currentContextId = state.contextId;
  let resetError: string | undefined;
  set({ status: "preparing", error: undefined });

  try {
    if (client && currentContextId) {
      await client.agentic.contexts.delete(currentContextId);
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
    contextId: null,
    detectedMode: null,
    status: client ? "ready" : "idle",
    error: resetError,
  };
  emit();
  logSessionConfig();
}

export function useConversationalAgentStore(): VoiceAgentState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
