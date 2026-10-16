import type { Corti } from "@corti/sdk";

export const WAKE_COMMAND_ID = "conversational_agent_wake";
export const DEBUG_LOG_LIMIT = 100;

export type ConversationRole = "user" | "assistant";
export type ConversationSource = "typed" | "voice";

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  text: string;
  source: ConversationSource;
  at: number;
}

export type DebugEntryType =
  | "session-config"
  | "interim-transcript"
  | "final-transcript"
  | "command"
  | "agent-request"
  | "agent-response"
  | "agent-stream-chunk"
  | "agent-error";

export interface DebugEntry {
  id: number;
  type: DebugEntryType;
  text: string;
  at: number;
  data?: unknown;
}

export interface ResettableConversationState {
  composer: string;
  contextId: string | null;
  error?: string;
  messages: ConversationMessage[];
  debugLog: DebugEntry[];
}

const WAKE_PREFIX_RE = /^(?:(?:ok(?:ay)?|hey)\s+)?corti\b[\s,:;-]*/i;

export function extractWakeIntent(
  command: Pick<Corti.TranscribeCommandData, "variables" | "rawTranscriptText">,
): string {
  const variable = command.variables?.intent?.trim();
  if (variable) {
    return variable;
  }

  return command.rawTranscriptText.replace(WAKE_PREFIX_RE, "").replace(/\s+/g, " ").trim();
}

let debugSeq = 0;

export function appendDebugEntry(
  entries: DebugEntry[],
  entry: Omit<DebugEntry, "id" | "at">,
): DebugEntry[] {
  return [
    ...entries,
    {
      ...entry,
      id: debugSeq++,
      at: Date.now(),
    },
  ].slice(-DEBUG_LOG_LIMIT);
}

export function clearConversationState<T extends ResettableConversationState>(state: T): T {
  return {
    ...state,
    composer: "",
    contextId: null,
    error: undefined,
    messages: [],
    debugLog: [],
  };
}
