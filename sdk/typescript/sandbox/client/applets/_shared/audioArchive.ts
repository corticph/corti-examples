export type AudioArchiveEndpoint = "transcribe" | "dictation";

export type AudioArchiveStartReason = "start" | "resume";

export type AudioArchiveEndReason = "pause" | "stop" | "disconnect" | "ended" | "error";

export interface AudioArchiveSegment {
  id: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  startReason: AudioArchiveStartReason;
  endReason?: AudioArchiveEndReason;
}

export interface AudioArchiveDraft {
  id: string;
  connectionKey: string;
  endpoint: AudioArchiveEndpoint;
  interactionId?: string;
  createdAt: number;
  updatedAt: number;
  deviceLabel?: string;
  configuredCaptureMime: string;
  actualCaptureMime: string | null;
  segments: AudioArchiveSegment[];
  chunkCount: number;
  totalBytes: number;
}

export interface StoredAudioArchive {
  id: string;
  connectionKey: string;
  endpoint: AudioArchiveEndpoint;
  interactionId?: string;
  createdAt: number;
  finalizedAt: number;
  deviceLabel?: string;
  configuredCaptureMime: string;
  actualCaptureMime: string | null;
  segments: AudioArchiveSegment[];
  segmentCount: number;
  chunkCount: number;
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
  fileName: string;
  blob: Blob;
}

export interface AudioArchiveListItem extends StoredAudioArchive {
  playbackUrl: string;
}

export function createAudioArchiveId() {
  return `archive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createAudioArchiveSegmentId() {
  return `segment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getAudioFileExtension(mimeType: string) {
  const normalized = mimeType.toLowerCase().split(";")[0].trim();
  switch (normalized) {
    case "audio/mp4":
    case "audio/m4a":
      return "m4a";
    case "audio/mpeg":
    case "audio/mp3":
    case "audio/mpeg3":
      return "mp3";
    case "audio/flac":
      return "flac";
    case "audio/ogg":
      return "ogg";
    case "audio/wav":
      return "wav";
    default:
      return "webm";
  }
}

export function buildAudioArchiveFileName(params: {
  endpoint: AudioArchiveEndpoint;
  createdAt: number;
  mimeType: string;
}) {
  const timestamp = new Date(params.createdAt)
    .toISOString()
    .replace(/[:]/g, "-")
    .replace(/\.\d{3}z$/i, "Z");
  return `corti-${params.endpoint}-session-${timestamp}.${getAudioFileExtension(params.mimeType)}`;
}

export function closeOpenAudioArchiveSegment(
  segments: AudioArchiveSegment[],
  endReason: AudioArchiveEndReason,
  endedAt = Date.now(),
) {
  let changed = false;
  const nextSegments = segments.map((segment, index) => {
    if (index !== segments.length - 1 || segment.endedAt != null) {
      return segment;
    }
    changed = true;
    return {
      ...segment,
      endedAt,
      durationMs: Math.max(0, endedAt - segment.startedAt),
      endReason,
    };
  });
  return changed ? nextSegments : segments;
}
