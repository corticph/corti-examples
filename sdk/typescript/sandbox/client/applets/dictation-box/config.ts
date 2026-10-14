/**
 * Dictation config for the dictation-box applet. Carries the applet's command
 * set (see commands.ts); on a match the server emits a `command` event that the
 * applet turns into a box/form effect.
 */
import type { Corti } from "@corti/sdk";
import { BOX_COMMANDS } from "./commands";

export function buildDictationConfig(primaryLanguage: string): Corti.TranscribeConfig {
  return {
    primaryLanguage,
    interimResults: true,
    spokenPunctuation: true,
    commands: BOX_COMMANDS,
    audioEvents: { enabled: true },
  };
}
