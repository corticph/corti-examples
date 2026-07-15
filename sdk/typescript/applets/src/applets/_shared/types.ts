/** Types for Corti WebSocket configuration. Kept in _shared so applets have no
 *  dependency on the host project's type definitions. */

export interface TranscribeTerm {
  term: string;
}

export interface KeytermsConfig {
  terms: TranscribeTerm[];
}

export interface ReplacementRule {
  find: string;
  replace: string;
}

export interface AudioEventsConfig {
  enabled: boolean;
}

export type AudioFormat =
  | "audio/ogg"
  | "audio/ogg; codecs=flac"
  | "audio/ogg; codecs=opus"
  | "audio/ogg; codecs=vorbis"
  | "audio/webm"
  | "audio/webm; codecs=flac"
  | "audio/webm; codecs=opus"
  | "audio/webm; codecs=vorbis"
  | "audio/opus"
  | "audio/vorbis"
  | "audio/mpeg"
  | "audio/mp3"
  | "audio/mpeg3"
  | "audio/flac"
  | "audio/mp4"
  | "audio/m4a";

export type VoiceCommandVariable =
  | { key: string; type: "enum"; enum: string[] }
  | { key: string; type: "wildcard" };

export interface VoiceCommand {
  id: string;
  localId?: string;
  phrases: string[];
  registered: boolean;
  variables: VoiceCommandVariable[];
}

export interface FormattingConfig {
  dates: string;
  times: string;
  numbers: string;
  measurements: string;
  numericRanges: string;
  ordinals: string;
}

export interface TranscribeConfiguration {
  primaryLanguage: string;
  interimResults?: boolean;
  spokenPunctuation?: boolean;
  automaticPunctuation?: boolean;
  terms?: TranscribeTerm[];
  keyterms?: KeytermsConfig;
  model?: string;
  commands?: VoiceCommand[];
  formatting?: FormattingConfig;
  audioEvents?: AudioEventsConfig;
  audioFormat?: AudioFormat;
  includeFormattingDefaults?: boolean;
  replacements?: ReplacementRule[];
}
