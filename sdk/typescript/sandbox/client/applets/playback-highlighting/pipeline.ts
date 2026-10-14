/**
 * Domain logic for the playback-highlighting pipeline.
 *
 * Uses the Corti SDK client for all REST calls. The SDK v6 serializer
 * accepts `wordLevel`, `async`, `automaticPunctuation`,
 * `spokenPunctuation`, and `formatting` natively — no raw fetch needed.
 */

import type { Corti, CortiClient } from "@corti/sdk";
import { buildFormattingOverrides } from "../_shared/formatting";
import type { FormattingConfig } from "../_shared/types";

export type PipelineStep =
  | "creating-interaction"
  | "uploading-recording"
  | "creating-transcript"
  | "polling"
  | "fetching-result";

export interface PipelineProgress {
  step: PipelineStep;
  pollAttempt?: number;
}

export interface TranscriptSegment {
  channel: number;
  participant: number;
  speakerId: number;
  text: string;
  start: number;
  end: number;
}

export interface PipelineResult {
  interactionId: string;
  recordingId: string;
  transcriptId: string;
  status: string;
  transcripts: TranscriptSegment[];
  wordLevel: boolean;
  rawResponse: unknown;
  wallClockMs: number;
}

export const PRIMARY_LANGUAGES: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "da", label: "Danish" },
  { value: "de", label: "German" },
  { value: "nl", label: "Dutch" },
  { value: "sv", label: "Swedish" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
];

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 90_000;

export function getAudioFileDurationMs(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration * 1000);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read audio duration from file"));
    };
    audio.src = url;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runPlaybackHighlightingPipeline(
  client: CortiClient,
  opts: {
    file: File;
    primaryLanguage: string;
    diarize: boolean;
    wordLevel: boolean;
    automaticPunctuation?: boolean;
    spokenPunctuation?: boolean;
    formatting?: FormattingConfig;
    onProgress?: (progress: PipelineProgress) => void;
  },
): Promise<PipelineResult> {
  const {
    file,
    primaryLanguage,
    diarize,
    wordLevel,
    automaticPunctuation,
    spokenPunctuation,
    formatting,
    onProgress,
  } = opts;

  const formattingOverrides = formatting ? buildFormattingOverrides(formatting) : undefined;

  const pipelineStart = Date.now();

  onProgress?.({ step: "creating-interaction" });
  const interaction = await client.interactions.create({
    encounter: {
      identifier: crypto.randomUUID(),
      status: "planned",
      type: "first_consultation",
    },
  });
  const interactionId = interaction.interactionId;

  onProgress?.({ step: "uploading-recording" });
  const recording = await client.recordings.upload(file, interactionId);
  const recordingId = recording.recordingId;

  onProgress?.({ step: "creating-transcript" });
  const start = Date.now();
  const created = await client.transcripts.create(interactionId, {
    recordingId,
    primaryLanguage,
    diarize,
    wordLevel: { enabled: wordLevel },
    async: true,
    ...(automaticPunctuation !== undefined ? { automaticPunctuation } : {}),
    ...(spokenPunctuation !== undefined ? { spokenPunctuation } : {}),
    ...(formattingOverrides
      ? { formatting: formattingOverrides as Corti.TranscriptsFormatting }
      : {}),
  });

  let status = created.status;
  const transcriptId = created.id;
  let attempt = 0;
  while (status === "processing") {
    if (Date.now() - start > POLL_TIMEOUT_MS) {
      throw new Error("Timed out waiting for the transcript to finish processing");
    }
    attempt += 1;
    onProgress?.({ step: "polling", pollAttempt: attempt });
    await sleep(POLL_INTERVAL_MS);
    const polled = await client.transcripts.getStatus(interactionId, transcriptId);
    status = polled.status;
  }

  if (status === "failed") {
    throw new Error("Transcript processing failed — the API reported status: failed");
  }

  onProgress?.({ step: "fetching-result" });
  const final = await client.transcripts.get(interactionId, transcriptId);

  return {
    interactionId,
    recordingId,
    transcriptId,
    status,
    transcripts: final.transcripts ?? [],
    wordLevel,
    rawResponse: final,
    wallClockMs: Date.now() - pipelineStart,
  };
}

export function describeTranscriptError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/403|forbidden/i.test(message)) {
    return "Transcript request failed (403). Verify the token scope, tenant, and environment.";
  }
  return message;
}
