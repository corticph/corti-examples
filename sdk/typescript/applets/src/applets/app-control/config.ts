/**
 * Dictation config for the app-control applet. Carries the applet's app-control
 * command set (see commands.ts); on a match the server emits a `command` event
 * that the applet routes to the AppControlRegistry.
 */
import type { Corti } from "@corti/sdk";
import { APP_COMMANDS } from "./commands";

export function buildDictationConfig(primaryLanguage: string): Corti.TranscribeConfig {
  return {
    primaryLanguage,
    interimResults: true,
    spokenPunctuation: true,
    commands: APP_COMMANDS,
    audioEvents: { enabled: true },
  };
}
