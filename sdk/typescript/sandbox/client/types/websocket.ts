export type Endpoint = "transcribe" | "streams" | "transcripts";

// Real Corti Auth Configuration
export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  cluster: string;
  tenant: string;
  authToken?: string;
  wsBaseUrl?: string;
}

// Real Corti Participant Structure
export interface Participant {
  channel: number;
  role: string;
  metadata?: [string, string][];
}

// Real Transcription Configuration
export interface TranscriptionConfig {
  primaryLanguage: string;
  diarize: boolean;
  isMultichannel: boolean;
  participants: Participant[];
}

// Real Mode Configuration for Streams
export interface ModeConfig {
  type: "facts" | "transcription";
  templateId?: string;
  outputLocale?: string;
}

export interface AudioEventsConfig {
  enabled: boolean;
}

export const AUDIO_FORMAT_OPTIONS = [
  "audio/ogg",
  "audio/ogg; codecs=flac",
  "audio/ogg; codecs=opus",
  "audio/ogg; codecs=vorbis",
  "audio/webm",
  "audio/webm; codecs=flac",
  "audio/webm; codecs=opus",
  "audio/webm; codecs=vorbis",
  "audio/opus",
  "audio/vorbis",
  "audio/mpeg",
  "audio/mp3",
  "audio/mpeg3",
  "audio/flac",
  "audio/mp4",
  "audio/m4a",
] as const;

export type AudioFormat = (typeof AUDIO_FORMAT_OPTIONS)[number];

// Real Streams Configuration Structure
export interface StreamConfiguration {
  specialtyId?: string;
  transcription: TranscriptionConfig;
  mode: ModeConfig;
  factGenerationInterval?: "fixed" | "fast_init";
  retentionPolicy?: "retain" | "none";
  audioEvents?: AudioEventsConfig;
  audioFormat?: AudioFormat;
  replacements?: ReplacementRule[];
  terms?: TranscribeTerm[];
  keyterms?: KeytermsConfig;
}

export interface ReplacementRule {
  find: string;
  replace: string;
}

export interface TranscribeTerm {
  term: string;
}

export interface KeytermsConfig {
  terms: TranscribeTerm[];
}

// Legacy/Simple Transcribe Configuration
export interface TranscribeConfiguration {
  primaryLanguage: string;
  interimResults?: boolean;
  spokenPunctuation?: boolean;
  automaticPunctuation?: boolean;
  terms?: TranscribeTerm[];
  keyterms?: KeytermsConfig;
  commands?: VoiceCommand[];
  formatting?: FormattingConfig;
  audioEvents?: AudioEventsConfig;
  audioFormat?: AudioFormat;
  includeFormattingDefaults?: boolean;
  replacements?: ReplacementRule[];
}

export type AudioEventType =
  | "speechQualityIssueDetected"
  | "speechQualityIssueRecovered"
  | "longSilenceDetected"
  | "longSilenceRecovered";

export interface AudioEventResult {
  id: string;
  event: AudioEventType;
  channel: number;
  startTimeMs: number;
  timestamp: number;
}

export interface AudioEventInterval {
  type: "speechQuality" | "longSilence";
  startSec: number;
  endSec: number | null; // null = still active
}

// Real API Message Structure
export interface ConfigMessage {
  type: "config";
  configuration: StreamConfiguration | TranscribeConfiguration;
}

// Interaction Creation Response
export interface InteractionResponse {
  interactionId: string;
  websocketUrl: string;
}

// Enhanced Voice Command (keeping for transcribe)
export type VoiceCommandVariable =
  | {
      key: string;
      type: "enum";
      enum: string[];
    }
  | {
      key: string;
      type: "wildcard";
    };

export interface VoiceCommand {
  id: string;
  localId?: string;
  phrases: string[];
  registered: boolean;
  variables: VoiceCommandVariable[];
}

// Formatting Config (keeping for transcribe)
export interface FormattingConfig {
  dates: string;
  times: string;
  numbers: string;
  measurements: string;
  numericRanges: string;
  ordinals: string;
}

export const DEFAULT_FORMATTING: FormattingConfig = {
  dates: "locale:long",
  times: "locale",
  numbers: "numerals_above_nine",
  measurements: "abbreviated",
  numericRanges: "numerals",
  ordinals: "numerals_above_nine",
};

// Valid formatting enum values from audio-bridge v2
export const FORMATTING_OPTIONS = {
  DATES: [
    { value: "locale:long", label: "Locale: Long" },
    { value: "locale:medium", label: "Locale: Medium" },
    { value: "locale:short", label: "Locale: Short" },
    { value: "iso", label: "2025-02-03" },
    { value: "as_dictated", label: "As dictated" },
    { value: "long_text", label: "3 February 2025" },
    { value: "eu_slash", label: "03/02/2025" },
    { value: "us_slash", label: "02/03/2025" },
    { value: "iso_compact", label: "20250203" },
  ],
  TIMES: [
    { value: "locale", label: "Locale" },
    { value: "as_dictated", label: "As dictated" },
    { value: "h12", label: "4:00pm" },
    { value: "h24", label: "16:00" },
  ],
  NUMBERS: [
    { value: "as_dictated", label: "As dictated" },
    { value: "numerals_above_nine", label: "Numbers 10+ as numerals" },
    { value: "numerals", label: "All numbers as numerals" },
  ],
  MEASUREMENTS: [
    { value: "as_dictated", label: "As dictated" },
    { value: "abbreviated", label: "Abbreviated (mm, cm, in)" },
  ],
  NUMERIC_RANGES: [
    { value: "as_dictated", label: "As dictated" },
    { value: "numerals", label: "Numerals (1-10)" },
  ],
  ORDINALS: [
    { value: "numerals_above_nine", label: "Ordinals 10+ as numerals" },
    { value: "as_dictated", label: "As dictated" },
    { value: "numerals", label: "Numerals (1st, 2nd)" },
  ],
} as const;

// WebSocket Message Types
export interface WebSocketMessage {
  id: string;
  timestamp: number;
  type: "sent" | "received" | "local";
  data: Record<string, unknown> | string;
  endpoint: Endpoint;
  messageType?: string;
}

// Transcript Data Structure
export interface TranscriptData {
  text: string;
  rawTranscriptText: string;
  start: number;
  end: number;
  isFinal: boolean;
}

// WebSocket Transcript Message
export interface WSTranscriptMessage {
  type: string;
  data: TranscriptData;
}

// Voice Command Data Structure
export interface VoiceCommandData {
  id: string;
  variables: Record<string, string>;
  rawTranscriptText: string;
  start: number;
  end: number;
}

// WebSocket Voice Command Message
export interface WSVoiceCommandMessage {
  type: string;
  data: VoiceCommandData;
}

// Streams Fact Data Structure
export interface StreamFactData {
  fact: string;
  category: string;
  confidence: number;
  timestamp: number;
}

// WebSocket Streams Fact Message
// WebSocket Facts Message (from audio-bridge v2facts_handler.go)
export interface WSFactsMessage {
  type: string;
  fact: WSFactData[]; // Note: array is in 'fact' field, not 'data'
}

export interface WSFactData {
  id: string;
  text: string;
  group: string;
  groupId: string;
  isDiscarded: boolean;
  source: string;
  createdAt: string;
  updatedAt?: string;
  evidence?: {
    type: string;
    reference: string;
    quote: string;
  }[];
}

// Legacy interface for backward compatibility
export interface WSStreamFactMessage {
  type: string;
  data: StreamFactData;
}

// Usage Message
export interface WSUsageMessage {
  type: string;
  credits: number;
}

// Error Message
export interface WSErrorMessage {
  type: string;
  error: {
    code: string;
    message: string;
  };
}

// Documentation Message (for streams endpoint)
export interface WSDocumentationMessage {
  type: string;
  sections: DocumentationSection[];
}

// Flush Message
export interface WSFlushMessage {
  type: string;
}

// Flushed Confirmation Message
export interface WSFlushedMessage {
  type: string;
}

export interface DocumentationSection {
  section: string;
  type: string;
  content: DocumentationContent[];
}

export interface DocumentationContent {
  text?: string;
  items?: string[];
}

// Response Types
export interface TranscriptResult {
  id: string;
  text: string;
  rawText: string;
  isFinal: boolean;
  start: number;
  end: number;
  timestamp: number;
  receivedAtSec: number;
  speechLagMs?: number | null;
  elapsedSec?: number | null;
  speaker?: string;
}

export interface LatencyStats {
  lagSumMs: number;
  lagCount: number;
  interimLagSumMs: number;
  interimLagCount: number;
}

export interface VoiceCommandResult {
  id: string;
  commandId: string;
  variables: Record<string, string>;
  rawText: string;
  start: number;
  end: number;
  timestamp: number;
}

export interface Fact {
  id: string;
  content: string; // Mapped from 'text' field
  category: string; // Mapped from 'group' field
  confidence: number;
  timestamp: number;
  groupId?: string;
  isDiscarded?: boolean;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  evidence?: {
    type: string;
    reference: string;
    quote: string;
  }[];
}

// Usage statistics
export interface UsageResult {
  id: string;
  credits: number;
  timestamp: number;
}

// Error result
export interface ErrorResult {
  id: string;
  code: string;
  message: string;
  timestamp: number;
}

// Documentation result
export interface DocumentationResult {
  id: string;
  sections: DocumentationSection[];
  timestamp: number;
}

export interface ConnectionStatus {
  status:
    | "disconnected"
    | "connecting"
    | "authenticating"
    | "creating_interaction"
    | "connected"
    | "ended"
    | "error";
  error?: string;
  lastConnected?: number;
  sessionId?: string;
  interactionId?: string;
  configStatus?: "pending" | "accepted" | "denied" | "timeout";
  acceptedConfig?: unknown;
}

export interface UsageStats {
  messagesExchanged: number;
  audioChunksSent: number;
  transcriptsReceived: number;
  commandsDetected: number;
  factsExtracted: number;
  usageReports: number;
  errors: number;
  configAccepted: number;
  configDenied: number;
  configTimeout: number;
  ended: number;
  flushesSent: number;
  flushedConfirmed: number;
  audioEventsReceived: number;
  connectionDuration: number;
  transcriptTokens: number;
  audioDurationSeconds: number;
  creditsConsumed: number;
}

export interface AudioConfig {
  deviceId?: string;
  channelCount: number;
  chunkSize: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  audioBitsPerSecond?: number;
  mimeType?: string;
  flushOnPause?: boolean;
}

// Audio source for the WebSocket endpoints: live microphone capture, or a
// pre-recorded file streamed through at a controlled rate.
export type AudioSource = "microphone" | "file";

export interface FileStreamConfig {
  // Streaming rate as a real-time factor: audio seconds sent per wall-clock
  // second. 1 = real time, 2 = twice as fast, etc.
  rtfx: number;
  // Whether the chunk size is expressed in milliseconds of audio or in bytes.
  chunkUnit: "ms" | "bytes";
  chunkMs: number;
  chunkBytes: number;
  // Play the file back through the speakers in sync with what's being sent
  // (playbackRate follows RTFx). Toggle acts as a live mute/unmute.
  monitor: boolean;
}

// Message type constants
export const MESSAGE_TYPES = {
  CONFIG: "config",
  COMMAND_REGISTRATION: "command_registration",
  TRANSCRIPT: "transcript",
  COMMAND: "command",
  FACTS: "facts",
  USAGE: "usage",
  DELTA_USAGE: "delta_usage",
  ERROR: "error",
  DOCUMENTATION: "documentation",
  CONFIG_ACCEPTED: "CONFIG_ACCEPTED",
  CONFIG_DENIED: "CONFIG_DENIED",
  CONFIG_TIMEOUT: "CONFIG_TIMEOUT",
  CONFIG_MISSING: "CONFIG_MISSING",
  CONFIG_NOT_PROVIDED: "CONFIG_NOT_PROVIDED",
  CONFIG_ALREADY_RECEIVED: "CONFIG_ALREADY_RECEIVED",
  ENDED: "ENDED",
  FLUSH: "flush",
  FLUSHED: "flushed",
  AUDIO_EVENT: "audioEvent",
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

// Available Environments
export const CLUSTERS = [
  { value: "eu", label: "Production (EU)" },
  { value: "us", label: "Production (US)" },
  { value: "staging-eu", label: "Staging (EU)" },
  { value: "dev-weu", label: "Development (WEU)" },
  { value: "dev-neu", label: "Development (NEU)" },
] as const;

// Role Options
export const PARTICIPANT_ROLES = [
  { value: "patient", label: "Patient" },
  { value: "doctor", label: "Doctor" },
  { value: "nurse", label: "Nurse" },
  { value: "agent", label: "Agent" },
  { value: "caller", label: "Caller" },
  { value: "multiple", label: "Multiple" },
  { value: "unknown", label: "Unknown" },
] as const;

// Helper functions
// REST is proxied through the local server (best practice #3): the browser
// holds no token/secret and the proxy injects auth + Tenant-Name. Origin-
// relative so it works regardless of host/port. The `cluster` arg is kept for
// signature compatibility but ignored — the server targets the right cluster.
export function buildApiUrl(_cluster?: string): string {
  return `${window.location.origin}/api/corti`;
}

export function buildWsBaseUrl(cluster: string): string {
  return `wss://api.${cluster}.corti.app/audio-bridge/v2`;
}
