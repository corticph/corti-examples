/**
 * Second-pass-agent-specific transcript shaping. The transcript wire types, REST
 * helpers, display flattening, and run-state live in the shared transcript
 * runner (`../_shared/transcript-runner`); only the speaker-labelled
 * agent-input flattening is the second-pass agent's own.
 */
import {
  getDisplayableSegments,
  normalizeTranscriptText,
  type TranscriptResponse,
  type TranscriptSegment,
} from "../_shared/transcript-runner/model";

function labelTranscriptSegment(segment: TranscriptSegment): string | null {
  if (typeof segment.speakerId === "number") {
    return `Speaker ${segment.speakerId}`;
  }
  if (typeof segment.channel === "number") {
    return `Channel ${segment.channel}`;
  }
  return null;
}

/**
 * Flattens the transcript for the second-pass agent, prefixing each segment
 * with its speaker/channel label so the agent can reason about who said what.
 */
export function flattenTranscriptForAgent(
  transcript: Pick<TranscriptResponse, "transcripts"> | null | undefined,
): string {
  return getDisplayableSegments(transcript)
    .map((segment) => {
      const text = normalizeTranscriptText(segment.text);
      const label = labelTranscriptSegment(segment);
      return label ? `${label}: ${text}` : text;
    })
    .join("\n");
}
