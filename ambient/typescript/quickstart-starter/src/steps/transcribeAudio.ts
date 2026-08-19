import * as fs from "node:fs";
import type { CortiClient } from "@corti/sdk";

export interface TranscribeResult {
  recordingId: string;
  fullText: string;
  segmentCount: number;
}

/**
 * Uploads the sample recording and runs it through async (non-streaming) transcription.
 * This is the simplest of Corti's transcription paths — for live/streaming ambient audio,
 * see ambient/typescript/basic-example instead.
 */
export async function transcribeAudio(
  client: CortiClient,
  interactionId: string,
  audioFilePath: string,
): Promise<TranscribeResult> {
  const { recordingId } = await client.recordings.upload(
    fs.createReadStream(audioFilePath, { autoClose: true }),
    interactionId,
  );

  if (!recordingId) {
    throw new Error("Corti API did not return a recordingId");
  }

  const transcript = await client.transcripts.create(interactionId, {
    recordingId,
    primaryLanguage: "en",
  });

  const segments = transcript.transcripts ?? [];
  const fullText = segments.map((segment) => segment.text).join(" ");

  return { recordingId, fullText, segmentCount: segments.length };
}
