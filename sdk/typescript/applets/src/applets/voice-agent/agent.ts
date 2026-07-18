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
const MIN_WORDS_KEY = "voiceAgent.minSpeculativeWords";

export const DEFAULT_DEBOUNCE_MS = 1500;
export const DEFAULT_MIN_SPECULATIVE_WORDS = 1;

// ─── Debug log ───────────────────────────────────────────────────────────────

export type DebugLogEventType =
  | "interim"
  | "speculative_fired"
  | "speculative_response"
  | "speculative_discarded"
  | "final_flushed"
  | "turn_merged"
  | "contextual_fired"
  | "contextual_response"
  | "mode_detected"
  | "audio_event";

export interface DebugLogEntry {
  id: string;
  tMs: number;
  event: DebugLogEventType;
  text: string;
  latencyMs?: number;
}

// Separate store so frequent log updates don't re-render the chat UI
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
  debugLog = [...debugLog, { id: crypto.randomUUID(), tMs: nowMs(), ...entry }];
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

// ─── Main agent state ─────────────────────────────────────────────────────────

interface VoiceAgentState {
  status: VoiceStatus;
  messages: VoiceMessage[];
  interimText: string;
  heldResponse: string | null;
  isSpeculating: boolean;
  pendingAgentMsgId: string | null;
  contextId: string | null;
  prompt: string;
  presetKey: string;
  responseDebounceMs: number;
  minSpeculativeWords: number;
  detectedMode: string | null;
  showProvisionalDetails: boolean;
  error?: string;
}

let client: CortiClient | null = null;
let lastAuth: CortiAuth.AuthTokenDerivable | null = null;
let namespace = "default";
let store: ConfigStore = createLocalConfigStore(namespace);
let agentId: string | null = null;
let preparedFor: string | null = null;

let speculativeSeq = 0;
let speculativeTimer: ReturnType<typeof setTimeout> | null = null;
// Index into state.messages from which history is included in speculative calls.
// Reset when orchestrator detects a new mode, so stale context doesn't bleed through.
let speculativeHistoryStartIdx = 0;

// Incremented each time sendContextual starts. A call that resolves with a stale seq
// was superseded by a turn-merge and must not commit its result.
let contextualSeq = 0;

// Timestamp of the last successful contextual response. Used to detect post-response
// continuations: new speech that arrives within responseDebounceMs*2 after a response
// is treated as part of the same turn rather than a new one.
let lastContextualResponseAt: number | null = null;

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
  minSpeculativeWords: DEFAULT_MIN_SPECULATIVE_WORDS,
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

function extractMode(text: string): { mode: string | null; cleanText: string } {
  const match = text.match(/^\[MODE:([^\]]+)\]\n?/);
  if (!match) {
    return { mode: null, cleanText: text };
  }
  return { mode: match[1], cleanText: text.slice(match[0].length).trim() };
}

// Builds a plain-text history preamble from the last `limit` turns starting at `startIdx`.
function formatHistoryPreamble(messages: VoiceMessage[], limit: number, startIdx: number): string {
  const relevant = messages
    .slice(startIdx)
    .filter((m) => !m.pending)
    .slice(-(limit * 2));
  if (!relevant.length) {
    return "";
  }
  const lines = relevant.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`);
  return `[Conversation context]\n${lines.join("\n")}\n\n`;
}

function loadStateFromStore() {
  const storedPresetKey = store.get<string>(PRESET_KEY, DEFAULT_PRESET_KEY) || DEFAULT_PRESET_KEY;
  const presetDefault = VOICE_PRESETS[storedPresetKey]?.prompt ?? defaultPreset.prompt;
  state = {
    ...state,
    prompt: store.get<string>(PROMPT_KEY, "") || presetDefault,
    presetKey: storedPresetKey,
    responseDebounceMs: store.get<number>(DEBOUNCE_KEY, DEFAULT_DEBOUNCE_MS) || DEFAULT_DEBOUNCE_MS,
    minSpeculativeWords:
      store.get<number>(MIN_WORDS_KEY, DEFAULT_MIN_SPECULATIVE_WORDS) ||
      DEFAULT_MIN_SPECULATIVE_WORDS,
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

export function setMinSpeculativeWords(n: number) {
  store.set(MIN_WORDS_KEY, n);
  set({ minSpeculativeWords: n });
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
}

// Stateless prefetch with injected conversation history — no contextId so the real thread
// is never touched. Fires on every interim (debounced 200ms) so the latest text is used.
async function fireSpeculative(text: string) {
  if (!client || !agentId) {
    return;
  }
  const seq = ++speculativeSeq;
  const firedAt = nowMs();

  const preamble = formatHistoryPreamble(state.messages, 6, speculativeHistoryStartIdx);
  const fullText = preamble
    ? `${preamble}[User is still speaking — this may be incomplete]\n${text}`
    : text;

  addLog({ event: "speculative_fired", text: snippet(text) });
  set({ isSpeculating: true });

  try {
    const result = await sendAgentMessage(client, agentId, fullText);
    if (seq !== speculativeSeq) {
      addLog({
        event: "speculative_discarded",
        text: snippet(result),
        latencyMs: nowMs() - firedAt,
      });
      return;
    }
    const { cleanText } = extractMode(result);
    addLog({
      event: "speculative_response",
      text: snippet(cleanText),
      latencyMs: nowMs() - firedAt,
    });
    set({ heldResponse: cleanText, isSpeculating: false });
  } catch {
    if (seq === speculativeSeq) {
      set({ isSpeculating: false });
    }
  }
}

// Fires on every interim — 200ms debounce collapses rapid bursts into one call.
// Skips if text is shorter than the configured minimum word count.
function scheduleSpeculative(text: string) {
  if (text.trim().split(/\s+/).length < state.minSpeculativeWords) {
    return;
  }
  if (speculativeTimer) {
    clearTimeout(speculativeTimer);
  }
  speculativeTimer = setTimeout(() => {
    speculativeTimer = null;
    void fireSpeculative(text);
  }, 200);
}

export function handleAudioEvent(eventType: string) {
  addLog({ event: "audio_event", text: eventType });
}

export function handleInterim(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return;
  }
  addLog({ event: "interim", text: snippet(normalized) });
  set({ interimText: normalized, error: undefined });
  scheduleSpeculative(normalized);
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

  // Post-response continuation window: new speech arriving shortly after a contextual
  // response is still part of the same turn (STT segment gaps can be 100s of ms even
  // during uninterrupted speech). Window = 2× responseDebounceMs.
  const timeSinceResponse =
    lastContextualResponseAt != null ? Date.now() - lastContextualResponseAt : Infinity;
  const isContinuation =
    state.status === "ready" && timeSinceResponse < state.responseDebounceMs * 2;

  // Merge into the current turn when: (a) the contextual call is still in flight
  // (thinking), or (b) we're within the post-response window (ready but recent).
  // Both cases: remove any stale trailing assistant message, extend the last user
  // message with the new text, and restart sendContextual with the merged text.
  if (state.status === "thinking" || isContinuation) {
    cancelSpeculative();

    const messages = [...state.messages];

    // Invalidate any in-flight sendContextual so it doesn't commit on resolution
    if (state.status === "thinking") {
      contextualSeq++;
    }

    // Post-response path: the last message is a (now stale) assistant response — remove it
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "assistant" && !lastMsg.pending) {
      messages.pop();
    }

    // Append to the last user message (always present at this point)
    const lastUserIdx = messages.reduce((best, m, i) => (m.role === "user" ? i : best), -1);
    const mergedText =
      lastUserIdx >= 0 ? `${messages[lastUserIdx].text} ${normalized}` : normalized;
    if (lastUserIdx >= 0) {
      messages[lastUserIdx] = { ...messages[lastUserIdx], text: mergedText };
    } else {
      messages.push({ id: crypto.randomUUID(), role: "user", text: mergedText, at: Date.now() });
    }

    addLog({ event: "turn_merged", text: snippet(mergedText) });

    state = {
      ...state,
      messages,
      interimText: "",
      heldResponse: null,
      isSpeculating: false,
      pendingAgentMsgId: null,
      status: "thinking",
      error: undefined,
    };
    emit();
    await sendContextual(mergedText);
    return;
  }

  addLog({ event: "final_flushed", text: snippet(normalized) });
  cancelSpeculative();

  const held = state.heldResponse;

  if (held) {
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

  const firedAt = nowMs();
  addLog({ event: "contextual_fired", text: snippet(text) });

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

    addLog({
      event: "contextual_response",
      text: snippet(responseText),
      latencyMs: nowMs() - firedAt,
    });

    // Mode changed — reset speculative history so prior context doesn't bleed across modes
    if (mode && mode !== state.detectedMode) {
      speculativeHistoryStartIdx = Math.max(0, state.messages.length - 2);
      addLog({ event: "mode_detected", text: mode });
    }

    lastContextualResponseAt = Date.now();

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

async function sendContextual(text: string) {
  if (!client || !agentId) {
    set({ status: "ready" });
    return;
  }

  const mySeq = ++contextualSeq;
  const firedAt = nowMs();
  addLog({ event: "contextual_fired", text: snippet(text) });

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

    // A turn-merge happened while we were awaiting — a newer call owns the commit.
    if (mySeq !== contextualSeq) {
      return;
    }

    lastContextualResponseAt = Date.now();

    const { mode, cleanText } = extractMode(result.text.trim());
    const responseText = cleanText || "(no response)";

    addLog({
      event: "contextual_response",
      text: snippet(responseText),
      latencyMs: nowMs() - firedAt,
    });

    // Mode changed — reset speculative history start to the current user turn
    if (mode && mode !== state.detectedMode) {
      speculativeHistoryStartIdx = Math.max(0, state.messages.length - 1);
      addLog({ event: "mode_detected", text: mode });
    }

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
  speculativeHistoryStartIdx = 0;
  lastContextualResponseAt = null;
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
