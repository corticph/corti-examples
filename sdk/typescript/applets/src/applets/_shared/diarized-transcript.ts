/**
 * Diarized-transcript ordering for Corti /streams.
 *
 * When diarization is enabled, `type: "transcript"` messages carry a `data`
 * ARRAY of segments, and segments for different speakers are finalized
 * independently — so they are NOT guaranteed to arrive in chronological order
 * over the WebSocket. Only final segments are sent (no interim).
 *
 * Rule (https://docs.corti.ai/stt/best-practices-diarized-transcripts):
 *   - Position each segment by `time.start` (tie-break `time.end`), NOT arrival.
 *   - Iterate the full `data` array on every message.
 *   - `speakerId` (−1 when diarization is off) is independent of
 *     `participant.channel`; do not assume a fixed mapping.
 *
 * Portable: depends only on the @corti/sdk StreamTranscript type.
 */
import type { Corti } from "@corti/sdk";

export type DiarizedSegment = Corti.StreamTranscript;

/**
 * Stable identity for a segment so repeated messages update in place rather
 * than duplicate. The Corti payload has no per-segment id, so we key on the
 * (start, end, speaker) tuple which is unique per finalized utterance.
 */
export function segmentKey(seg: DiarizedSegment): string {
  return `${seg.time.start}:${seg.time.end}:${seg.speakerId}`;
}

function compareSegments(a: DiarizedSegment, b: DiarizedSegment): number {
  return a.time.start - b.time.start || a.time.end - b.time.end;
}

/**
 * Merge one transcript message's `data` array into a running list, keeping the
 * result sorted by start time. Pure: returns a new array.
 */
export function mergeDiarizedSegments(
  current: DiarizedSegment[],
  incoming: DiarizedSegment[],
): DiarizedSegment[] {
  const byKey = new Map<string, DiarizedSegment>();
  for (const seg of current) {
    byKey.set(segmentKey(seg), seg);
  }
  for (const seg of incoming) {
    byKey.set(segmentKey(seg), seg);
  }
  return Array.from(byKey.values()).sort(compareSegments);
}

export interface SpeakerGroup {
  speakerId: number;
  channel: number;
  segments: DiarizedSegment[];
}

/**
 * Group an ordered segment list into consecutive runs by speaker, so the UI can
 * render speaker-labelled blocks without interleaving one speaker's words into
 * another's. Input should already be ordered (e.g. via mergeDiarizedSegments).
 */
export function groupBySpeakerRuns(segments: DiarizedSegment[]): SpeakerGroup[] {
  const groups: SpeakerGroup[] = [];
  for (const seg of segments) {
    const last = groups[groups.length - 1];
    if (last && last.speakerId === seg.speakerId) {
      last.segments.push(seg);
    } else {
      groups.push({
        speakerId: seg.speakerId,
        channel: seg.participant?.channel,
        segments: [seg],
      });
    }
  }
  return groups;
}
