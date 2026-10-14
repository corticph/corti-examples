/**
 * Dictation config for the commands applet. The `commands` array is built from
 * the managed command store (see command-model.ts / command-store.ts) and sent
 * to /transcribe; on a match the server emits a `command` event that the
 * dispatcher turns into a real editor action.
 */
import type { Corti } from "@corti/sdk";

export function buildDictationConfig(
  primaryLanguage: string,
  commands: Corti.TranscribeCommand[],
): Corti.TranscribeConfig {
  return {
    primaryLanguage,
    interimResults: true,
    spokenPunctuation: true,
    commands,
    audioEvents: { enabled: true },
  };
}
