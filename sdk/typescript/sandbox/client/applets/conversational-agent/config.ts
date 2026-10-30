import type { Corti } from "@corti/sdk";

export function buildVoiceConfig(primaryLanguage: string): Corti.TranscribeConfig {
  return {
    primaryLanguage,
    interimResults: true,
    automaticPunctuation: false,
    audioEvents: { enabled: true },
  };
}
