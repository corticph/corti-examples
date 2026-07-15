/**
 * Shared model for the offline `/transcripts` runner used by the
 * file-transcription and second-pass-agent applets. Holds the transcript wire types,
 * pure run-state helpers, and transcript flattening. Agent-specific shaping
 * (e.g. speaker-labelled flattening) lives with the applet that needs it.
 */
export type TranscriptSourceMode = "upload" | "recording";
export type UploadInteractionMode = "new" | "existing";

export type TranscriptPhase =
  | "idle"
  | "loading_interactions"
  | "loading_recordings"
  | "uploading"
  | "creating_transcript"
  | "polling"
  /** Optional post-transcript work (e.g. an agent pass). Skipped by default. */
  | "second_pass"
  | "done"
  | "error";

export type TranscriptProcessingStatus = "processing" | "completed" | "failed";

export interface InteractionSummary {
  id: string;
  title: string;
  patientName: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TranscriptParticipantRole {
  channel?: number;
  role?: string;
}

export interface TranscriptMetadata {
  participantsRoles?: TranscriptParticipantRole[];
}

export interface TranscriptSegment {
  channel?: number;
  participant?: number;
  speakerId?: number;
  text?: string;
  start?: number;
  end?: number;
}

export interface TranscriptUsageInfo {
  creditsConsumed?: number;
}

export interface TranscriptResponse {
  id: string;
  metadata: TranscriptMetadata;
  transcripts: TranscriptSegment[] | null;
  usageInfo?: TranscriptUsageInfo;
  recordingId: string;
  status: TranscriptProcessingStatus;
}

export interface TranscriptCreateRequest {
  recordingId: string;
  primaryLanguage: string;
  isDictation: boolean;
  isMultichannel: boolean;
  diarize: boolean;
  participants?: Array<{
    channel: number;
    role?: string;
  }>;
  async: true;
}

export interface TranscriptCreateResult {
  transcriptId: string;
  status: TranscriptProcessingStatus;
}

export interface TranscriptRunState {
  phase: TranscriptPhase;
  error?: string;
  interactionId: string | null;
  recordingId: string | null;
  transcriptId: string | null;
  transcriptStatus: TranscriptProcessingStatus | null;
  transcriptText: string;
  transcriptJson: TranscriptResponse | null;
}

export function createEmptyRunState(): TranscriptRunState {
  return {
    phase: "idle",
    interactionId: null,
    recordingId: null,
    transcriptId: null,
    transcriptStatus: null,
    transcriptText: "",
    transcriptJson: null,
  };
}

export function resetRunStateForNewRun(
  phase: Extract<
    TranscriptPhase,
    "uploading" | "creating_transcript" | "polling" | "second_pass"
  >,
): TranscriptRunState {
  return {
    ...createEmptyRunState(),
    phase,
  };
}

export function normalizeTranscriptText(
  text: string | null | undefined,
): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

export function getDisplayableSegments(
  transcript: Pick<TranscriptResponse, "transcripts"> | null | undefined,
): TranscriptSegment[] {
  return (transcript?.transcripts || []).filter(
    (segment) => normalizeTranscriptText(segment.text).length > 0,
  );
}

export function flattenTranscriptForDisplay(
  transcript: Pick<TranscriptResponse, "transcripts"> | null | undefined,
): string {
  return getDisplayableSegments(transcript)
    .map((segment) => normalizeTranscriptText(segment.text))
    .join(" ");
}

export function formatInteractionLabel(
  interaction: InteractionSummary,
): string {
  const primary =
    interaction.title || interaction.patientName || interaction.id;
  const secondary =
    interaction.patientName && interaction.patientName !== primary
      ? ` · ${interaction.patientName}`
      : "";
  return `${primary}${secondary} · ${interaction.id.slice(0, 8)}…`;
}

/**
 * Deterministic JSON download filename. Pass a `prefix` to namespace the file
 * per applet (e.g. `corti-second-pass-transcript`).
 */
export function buildTranscriptJsonFilename(
  transcriptId: string,
  prefix = "corti-transcript",
): string {
  return `${prefix}-${transcriptId}.json`;
}

export function resolveTranscriptIdFromCreateResponse(
  body: Partial<TranscriptResponse> | null | undefined,
  locationHeader?: string | null,
): string {
  if (body?.id) {
    return body.id;
  }

  const location = locationHeader?.trim();
  if (location) {
    const match = location.match(
      /\/transcripts\/([^/?#]+)(?:\/status)?(?:[/?#]|$)/,
    );
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  throw new Error(
    "Transcript creation response did not include a transcript id or Location header.",
  );
}
