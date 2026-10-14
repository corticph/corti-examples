/**
 * Hook for accumulating live `/transcribe` transcript segments and commands.
 *
 * The dictation web component emits `transcript` events with
 * `TranscribeTranscriptData` — a single object (not an array) with
 * `text`, `start`, `end` (seconds), and `isFinal`. This hook:
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
import type { TranscriptSegment } from "./pipeline";

interface TranscribeTranscriptDataLike {
  text: string;
  start: number;
  end: number;
  isFinal: boolean;
}

export interface DetectedCommand {
  id: string;
  variables?: Record<string, string | null> | null;
  rawTranscriptText: string;
  startMs: number;
  endMs: number;
}

export function useLiveTranscript(priorAudioDurationMs: number = 0) {
  const segmentsRef = useRef<TranscriptSegment[]>([]);
  const commandsRef = useRef<DetectedCommand[]>([]);
  const priorAudioDurationRef = useRef(0);
  const gapOffsetRef = useRef(0);
  const firstSegmentOfRecordingRef = useRef(true);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [commands, setCommands] = useState<DetectedCommand[]>([]);
  const [interim, setInterim] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);

  priorAudioDurationRef.current = priorAudioDurationMs;

  const reset = useCallback(() => {
    segmentsRef.current = [];
    commandsRef.current = [];
    gapOffsetRef.current = 0;
    firstSegmentOfRecordingRef.current = true;
    setSegments([]);
    setCommands([]);
    setInterim("");
    setHasRecording(false);
  }, []);

  const handleTranscript = useCallback((e: CustomEvent) => {
    const data = e.detail?.data as TranscribeTranscriptDataLike | undefined;
    if (!data || Array.isArray(data)) {
      return;
    }
    if (!data.isFinal) {
      setInterim(data.text);
      return;
    }
    setInterim("");

    if (firstSegmentOfRecordingRef.current) {
      firstSegmentOfRecordingRef.current = false;
      // For recordings after the first, shift timestamps so the first
      // segment starts at the cumulative audio duration of prior recordings.
      // priorAudioDurationRef holds the actual MediaRecorder duration sum,
      // which includes trailing silence the server timestamp doesn't.
      if (priorAudioDurationRef.current > 0) {
        const serverStartMs = Math.round(data.start * 1000);
        gapOffsetRef.current = priorAudioDurationRef.current - serverStartMs;
      }
    }

    const start = Math.round(data.start * 1000) + gapOffsetRef.current;
    const end = Math.round(data.end * 1000) + gapOffsetRef.current;

    const next = [
      ...segmentsRef.current,
      {
        text: data.text,
        start,
        end,
        channel: 0,
        participant: 0,
        speakerId: 0,
      },
    ];
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
      firstSegmentOfRecordingRef.current = true;
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
    interim,
    isRecording,
    hasRecording,
    reset,
    handleTranscript,
    handleCommand,
    handleRecordingStateChanged,
  };
}
