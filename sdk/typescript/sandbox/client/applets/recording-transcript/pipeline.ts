/**
 * Domain logic for the REST recording-to-transcript pipeline: create an
 * interaction, upload a recording, create an async transcript, poll it to
 * completion, then fetch the finalized result.
 *
 * There is no single "transcribe this file" call — `/transcripts` only
 * accepts a `recordingId` that already lives on an interaction, so the four
 * requests below are the minimum sequence, not an implementation choice.
 */

import type { Corti, CortiClient } from "@corti/sdk";

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

export interface RtfxTiming {
  /** Real duration of the uploaded audio file, read client-side via <audio> metadata. */
  audioDurationMs: number;
  /** Wall clock from the initial POST /transcripts to the completed status. */
  wallClockMs: number;
  /** audioDurationMs / wallClockMs — how many seconds of audio processed per wall-clock second. */
  rtfx: number;
}

export interface PipelineResult {
  interactionId: string;
  recordingId: string;
  transcriptId: string;
  status: Corti.TranscriptsStatusEnum;
  transcripts: Corti.CommonTranscriptResponse[];
  timing: RtfxTiming;
}

/** Common STT primary-language presets. Full list: client.languages.list() (see the "Languages" applet). */
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

/** Reads real audio duration from file metadata, the same signal the sandbox's RTFx timing uses elsewhere. */
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

export async function runRecordingTranscriptPipeline(
  client: CortiClient,
  opts: {
    file: File;
    primaryLanguage: string;
    diarize: boolean;
    onProgress?: (progress: PipelineProgress) => void;
  },
): Promise<PipelineResult> {
  const { file, primaryLanguage, diarize, onProgress } = opts;

  onProgress?.({ step: "creating-interaction" });
  const interaction = await client.interactions.create({
    encounter: {
      identifier: crypto.randomUUID(),
      status: "planned",
      type: "first_consultation",
    },
  });

  onProgress?.({ step: "uploading-recording" });
  const [audioDurationMs, recording] = await Promise.all([
    getAudioFileDurationMs(file).catch(() => 0),
    client.recordings.upload(file, interaction.interactionId),
  ]);

  onProgress?.({ step: "creating-transcript" });
  const start = Date.now();
  const created = await client.transcripts.create(interaction.interactionId, {
    recordingId: recording.recordingId,
    primaryLanguage,
    diarize,
    async: true,
  });

  let status = created.status;
  const transcriptId = created.id;
  let attempt = 0;
  while (status === "processing") {
    if (Date.now() - start > POLL_TIMEOUT_MS) {
      throw new Error(
        "Timed out waiting for the transcript to finish processing",
      );
    }
    attempt += 1;
    onProgress?.({ step: "polling", pollAttempt: attempt });
    await sleep(POLL_INTERVAL_MS);
    const polled = await client.transcripts.getStatus(
      interaction.interactionId,
      transcriptId,
    );
    status = polled.status;
  }

  const wallClockMs = Date.now() - start;

  if (status === "failed") {
    throw new Error(
      "Transcript processing failed — the API reported status: failed",
    );
  }

  onProgress?.({ step: "fetching-result" });
  const final = await client.transcripts.get(
    interaction.interactionId,
    transcriptId,
  );

  return {
    interactionId: interaction.interactionId,
    recordingId: recording.recordingId,
    transcriptId,
    status,
    transcripts: final.transcripts ?? [],
    timing: {
      audioDurationMs,
      wallClockMs,
      rtfx: audioDurationMs > 0 ? audioDurationMs / wallClockMs : 0,
    },
  };
}

/** Human-friendly error message with guidance for a 403 response. */
export function describeTranscriptError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/403|forbidden/i.test(message)) {
    return "Transcript request failed (403). Verify the token scope, tenant, and environment.";
  }
  return message;
}
