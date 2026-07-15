/**
 * Dictation config for the rich-text applet. The focus here is client-side text
 * insertion into formatted content, so the command set is intentionally empty.
 */
import type { Corti } from "@corti/sdk";

export function buildDictationConfig(
  primaryLanguage: string,
): Corti.TranscribeConfig {
  return {
    primaryLanguage,
    interimResults: true,
    spokenPunctuation: true,
    audioEvents: { enabled: true },
  };
}
