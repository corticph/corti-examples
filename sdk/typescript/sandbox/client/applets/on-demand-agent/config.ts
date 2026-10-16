import type { Corti } from "@corti/sdk";
import { COPY_EDIT_COMMAND_ID } from "./agent";

/** Dictation config: a single command that triggers the agentic copy-edit. */
export function buildCopyEditConfig(
  primaryLanguage: string,
  commandPhrase: string,
): Corti.TranscribeConfig {
  return {
    primaryLanguage,
    interimResults: true,
    spokenPunctuation: true,
    audioEvents: { enabled: true },
    commands: [
      {
        id: COPY_EDIT_COMMAND_ID,
        phrases: [commandPhrase || "copy edit"],
      },
    ],
  };
}
