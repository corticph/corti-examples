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
