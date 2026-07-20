/**
 * Stream config builder for the ambient applet.
 *
 * Diarization separates speakers within a single (mono) stream; multichannel
 * instead assigns roles to fixed audio channels. They are mutually exclusive in
 * this example. `mode` switches between live transcription and facts extraction.
 */
import type { Corti } from "@corti/sdk";

export interface AmbientSettings {
  primaryLanguage: string;
  isMultichannel: boolean;
  isDiarization: boolean;
  mode: "transcription" | "facts";
}

export const DEFAULT_AMBIENT_SETTINGS: AmbientSettings = {
  primaryLanguage: "en",
  isMultichannel: false,
  isDiarization: true,
  mode: "transcription",
};

export function buildStreamConfig(s: AmbientSettings): Corti.StreamConfig {
  return {
    transcription: {
      primaryLanguage: s.primaryLanguage,
      isDiarization: s.isMultichannel ? false : s.isDiarization,
      isMultichannel: s.isMultichannel,
      participants: s.isMultichannel
        ? [
            { channel: 0, role: "doctor" },
            { channel: 1, role: "patient" },
          ]
        : [],
    },
    mode: {
      type: s.mode === "facts" ? "facts" : "transcription",
      ...(s.mode === "facts" ? { outputLocale: s.primaryLanguage } : {}),
    },
    audioEvents: { enabled: true },
  };
}
