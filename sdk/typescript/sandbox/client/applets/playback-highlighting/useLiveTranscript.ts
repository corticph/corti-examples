/**
 * Hook for accumulating live `/transcribe` transcript segments and commands.
 *
 * The dictation web component re-emits each server transcript message as a
 * `transcript` event. The `data` payload shape depends on the session's
 * `wordLevel` configuration: with `wordLevel` enabled, final transcripts
 * arrive batched — one message per finalized utterance whose `data` is a
 * list of word items, and interim previews arrive as a one-element list;
 * with `wordLevel` disabled, `data` stays a single segment object. The
 * shared `normalizeTranscriptMessageData` narrows either shape into one
 * batch, and this hook:
 *
 *  - Converts timestamps from seconds to milliseconds on intake so the
 *    segments match the `TranscriptSegment` shape used by the file-mode
 *    pipeline and the `SyncedTranscriptPlayer`.
 *  - Accumulates final segments across multiple recordings (additive —
 *    starting a new recording does not clear prior segments). The `reset`
 *    function clears everything for a fresh start.
 *  - Tracks the current interim text for ghost-text display.
 *  - Tracks recording state from `recording-state-changed` events.
 *  - Accumulates `command` events with their timestamps (also in seconds,
 *    converted to ms) for display in the player's command list.
 *  - Keeps every final transcript message in its native wire shape
 *    (session-relative seconds) for the player's JSON view/download.
 *
 * Timestamp offset: the `/transcribe` socket reuses across recordings and
 * server timestamps are session-relative (they keep climbing through idle
 * gaps between recordings). Concatenated audio has no gaps, so each new
 * recording's timestamps must be shifted to start where prior audio ends.
 * We use the actual MediaRecorder duration (from archives) as the audio
 * timeline position, not the server's last-word timestamp — the audio
 * includes trailing silence after the last word that the server timestamp
 * doesn't account for.
 */

import { useCallback, useRef, useState } from "react";
import { normalizeTranscriptMessageData } from "../_shared/transcriptMessage";
import type { TranscriptSegment } from "./pipeline";

export interface DetectedCommand {
  id: string;
  variables?: Record<string, string | null> | null;
  rawTranscriptText: string;
  startMs: number;
  endMs: number;
}

/**
 * A final `/transcribe` transcript message, kept in its native wire shape
 * (`data` is a list of word items with `wordLevel` enabled, a single segment
 * object otherwise). Exported verbatim for the JSON view/download.
 */
export interface FinalTranscriptMessage {
  type: "transcript";
  data: unknown;
}

export function useLiveTranscript(priorAudioDurationMs: number = 0) {
  const segmentsRef = useRef<TranscriptSegment[]>([]);
  const commandsRef = useRef<DetectedCommand[]>([]);
  const finalMessagesRef = useRef<FinalTranscriptMessage[]>([]);
  const priorAudioDurationRef = useRef(0);
  const gapOffsetRef = useRef(0);
  const firstBatchOfRecordingRef = useRef(true);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [commands, setCommands] = useState<DetectedCommand[]>([]);
  const [finalMessages, setFinalMessages] = useState<FinalTranscriptMessage[]>([]);
  const [interim, setInterim] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);

  priorAudioDurationRef.current = priorAudioDurationMs;

  const reset = useCallback(() => {
    segmentsRef.current = [];
    commandsRef.current = [];
    finalMessagesRef.current = [];
    gapOffsetRef.current = 0;
    firstBatchOfRecordingRef.current = true;
    setSegments([]);
    setCommands([]);
    setFinalMessages([]);
    setInterim("");
    setHasRecording(false);
  }, []);

  const handleTranscript = useCallback((e: CustomEvent) => {
    const batch = normalizeTranscriptMessageData(e.detail?.data);
    if (batch.kind === "ignore") {
      return;
    }
    if (batch.kind === "interim") {
      setInterim(batch.text);
      return;
    }
    setInterim("");

    // Keep the final message in its native wire shape for the JSON
    // view/download.
    finalMessagesRef.current = [...finalMessagesRef.current, e.detail as FinalTranscriptMessage];
    setFinalMessages(finalMessagesRef.current);

    if (firstBatchOfRecordingRef.current) {
      firstBatchOfRecordingRef.current = false;
      // For recordings after the first, shift timestamps so the first
      // item of this recording starts at the cumulative audio duration of
      // prior recordings. priorAudioDurationRef holds the actual
      // MediaRecorder duration sum, which includes trailing silence the
      // server timestamp doesn't.
      const firstStart = batch.items[0].start;
      if (priorAudioDurationRef.current > 0 && firstStart !== undefined) {
        const serverStartMs = Math.round(firstStart * 1000);
        gapOffsetRef.current = priorAudioDurationRef.current - serverStartMs;
      }
    }

    const next = [...segmentsRef.current];
    for (const item of batch.items) {
      const prevEndMs = next.length > 0 ? next[next.length - 1].end : 0;
      // start/end are optional in the message schema. An untimed word
      // inherits the previous segment's end (already offset-adjusted) or
      // the session start, so the timeline stays monotonic.
      const start =
        item.start !== undefined ? Math.round(item.start * 1000) + gapOffsetRef.current : prevEndMs;
      const end =
        item.end !== undefined ? Math.round(item.end * 1000) + gapOffsetRef.current : start;
      next.push({
        text: item.text,
        start,
        end,
        channel: 0,
        participant: 0,
        speakerId: 0,
      });
    }
    segmentsRef.current = next;
    setSegments(next);
  }, []);

  const handleCommand = useCallback((e: CustomEvent) => {
    const data = e.detail?.data as
      | {
          id: string;
          variables?: Record<string, string | null> | null;
          rawTranscriptText: string;
          start: number;
          end: number;
        }
      | undefined;
    if (!data) {
      return;
    }
    const cmd: DetectedCommand = {
      id: data.id,
      variables: data.variables,
      rawTranscriptText: data.rawTranscriptText,
      startMs: Math.round(data.start * 1000) + gapOffsetRef.current,
      endMs: Math.round(data.end * 1000) + gapOffsetRef.current,
    };
    const next = [...commandsRef.current, cmd];
    commandsRef.current = next;
    setCommands(next);
  }, []);

  const handleRecordingStateChanged = useCallback((e: CustomEvent) => {
    const state = e.detail?.state as string | undefined;
    if (state === "recording") {
      firstBatchOfRecordingRef.current = true;
      setIsRecording(true);
    } else if (state === "stopped") {
      setIsRecording(false);
      setSegments(segmentsRef.current);
      if (segmentsRef.current.length > 0) {
        setHasRecording(true);
      }
    }
  }, []);

  return {
    segments,
    commands,
    finalMessages,
    interim,
    isRecording,
    hasRecording,
    reset,
    handleTranscript,
    handleCommand,
    handleRecordingStateChanged,
  };
}
