/**
 * Parse a pasted plain-text transcript into `DiarizedSegment[]` so it can
 * flow through the same rendering and note-generation paths as the ambient
 * scribe's live transcript.
 *
 * Speaker labels are optional. Recognized forms (case-insensitive, 1-indexed):
 *   - "Speaker 1: …"
 *   - "Speaker 1 - …"
 *   - "Channel 2: …"
 * Lines without a label are grouped under a single default speaker. If the
 * whole paste has no labels at all, every line is treated as one undiarized
 * run (`speakerId: -1`), matching how the ambient stream marks diarization-off.
 *
 * Timing is synthetic: each line gets an incrementing 1 ms window starting at
 * 0, so `segmentKey` (start:end:speaker) stays unique and `mergeDiarizedSegments`
 * keeps a stable order. The `id` is a constant `"pasted"` sentinel — pasted
 * segments are never merged with ambient ones (the panel shows one mode at a
 * time), so a shared id is fine.
 */

import type { DiarizedSegment } from "../_shared/diarizedTranscript";

const PASTED_ID = "pasted";

/**
 * Matches an optional leading speaker/channel label. Captures:
 *   group 1 — kind ("speaker" | "channel"), group 2 — the 1-indexed number.
 * Trailing separator (`:` or ` - `) is consumed but not captured.
 */
const LABEL_RE = /^(?:speaker|channel)\s+(\d+)\s*[:-]\s*(.*)$/i;

interface ParsedLine {
  speakerId: number;
  text: string;
}

function parseLine(raw: string): ParsedLine | null {
  const line = raw.trim();
  if (line.length === 0) {
    return null;
  }
  const match = LABEL_RE.exec(line);
  if (match) {
    const num = Number.parseInt(match[1], 10);
    const text = match[2].trim();
    if (text.length === 0) {
      return null;
    }
    return { speakerId: num, text };
  }
  // Unlabeled line — assigned a default speaker id resolved by the caller
  // once we know whether any labels were present.
  return { speakerId: Number.NaN, text: line };
}

/**
 * Parse pasted transcript text into diarized segments.
 */
export function parsePastedTranscript(text: string): DiarizedSegment[] {
  const parsed = text
    .split(/\r?\n/)
    .map(parseLine)
    .filter((l): l is ParsedLine => l !== null);

  if (parsed.length === 0) {
    return [];
  }

  const anyLabeled = parsed.some((l) => !Number.isNaN(l.speakerId));
  const defaultSpeakerId = anyLabeled ? 0 : -1;

  const segments: DiarizedSegment[] = [];
  parsed.forEach((line, i) => {
    const speakerId = Number.isNaN(line.speakerId) ? defaultSpeakerId : line.speakerId;
    segments.push({
      id: PASTED_ID,
      transcript: line.text,
      final: true,
      speakerId,
      participant: { channel: speakerId === -1 ? 0 : speakerId },
      time: { start: i, end: i + 1 },
    });
  });
  return segments;
}
