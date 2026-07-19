import type { Corti } from "@corti/sdk";

export const WAKE_COMMAND_ID = "conversational_agent_wake";
export const DEBUG_LOG_LIMIT = 50;

export type ConversationRole = "user" | "assistant";
export type ConversationSource = "typed" | "voice";

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  text: string;
  source: ConversationSource;
  at: number;
}

export interface DebugEntry {
  id: string;
  type: "transcript" | "command";
  text: string;
  at: number;
  variables?: Record<string, string | null> | null;
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

export function appendDebugEntry(
  entries: DebugEntry[],
  entry: Omit<DebugEntry, "id" | "at">,
): DebugEntry[] {
  return [
    {
      ...entry,
      id: crypto.randomUUID(),
      at: Date.now(),
    },
    ...entries,
  ].slice(0, DEBUG_LOG_LIMIT);
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
