import type { Corti, CortiClient } from "@corti/sdk";
import type {
  InteractionSummary,
  TranscriptCreateRequest,
  TranscriptCreateResult,
  TranscriptProcessingStatus,
  TranscriptResponse,
} from "./model";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 120;

export async function listInteractions(client: CortiClient): Promise<InteractionSummary[]> {
  const page = await client.interactions.list({});
  const items: InteractionSummary[] = [];
  for await (const interaction of page) {
    items.push({
      id: interaction.id,
      title: interaction.encounter?.title || "Untitled interaction",
      patientName: interaction.patient?.name || "Unknown patient",
      createdAt: interaction.createdAt.toISOString(),
      updatedAt: interaction.updatedAt.toISOString(),
    });
  }
  return items.sort((a, b) => {
    const left = Date.parse(b.updatedAt || b.createdAt || "") || 0;
    const right = Date.parse(a.updatedAt || a.createdAt || "") || 0;
    return left - right;
  });
}

export async function createExamplesInteraction(client: CortiClient): Promise<string> {
  const data = await client.interactions.create({
    encounter: {
      identifier: `corti-examples-${Date.now()}`,
      status: "planned",
      type: "consultation",
      period: {
        startedAt: new Date(),
        endedAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      title: "Corti Examples Session",
    },
    patient: {
      identifier: "test-patient-1",
      name: "Test Patient",
      gender: "unknown",
      birthDate: new Date("1990-01-01T00:00:00Z"),
      pronouns: "They/Them",
    },
  });
  return data.interactionId;
}

export async function listRecordings(
  client: CortiClient,
  interactionId: string,
): Promise<string[]> {
  const data = await client.recordings.list(interactionId);
  return data.recordings;
}

export async function uploadRecording(
  client: CortiClient,
  interactionId: string,
  file: File,
): Promise<string> {
  const data = await client.recordings.upload(file, interactionId);
  return data.recordingId;
}

export async function createTranscript(
  client: CortiClient,
  interactionId: string,
  request: TranscriptCreateRequest,
): Promise<TranscriptCreateResult> {
  const data = await client.transcripts.create(
    interactionId,
    request as unknown as Corti.TranscriptsCreateRequest,
  );
  return {
    transcriptId: data.id,
    status: (data.status || "processing") as TranscriptProcessingStatus,
  };
}

export async function getTranscriptStatus(
  client: CortiClient,
  interactionId: string,
  transcriptId: string,
): Promise<TranscriptProcessingStatus> {
  const data = await client.transcripts.getStatus(interactionId, transcriptId);
  if (data.status !== "processing" && data.status !== "completed" && data.status !== "failed") {
    throw new Error("Transcript status response was missing a valid status.");
  }
  return data.status;
}

export async function pollTranscriptUntilReady(
  client: CortiClient,
  interactionId: string,
  transcriptId: string,
  options?: {
    onStatus?: (status: TranscriptProcessingStatus) => void;
    maxAttempts?: number;
    intervalMs?: number;
  },
): Promise<TranscriptProcessingStatus> {
  const maxAttempts = options?.maxAttempts || MAX_POLL_ATTEMPTS;
  const intervalMs = options?.intervalMs || POLL_INTERVAL_MS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = await getTranscriptStatus(client, interactionId, transcriptId);
    options?.onStatus?.(status);
    if (status !== "processing") {
      return status;
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, intervalMs));
  }

  throw new Error("Timed out waiting for transcript processing to complete.");
}

export async function getTranscript(
  client: CortiClient,
  interactionId: string,
  transcriptId: string,
): Promise<TranscriptResponse> {
  const data = await client.transcripts.get(interactionId, transcriptId);
  return {
    id: data.id,
    metadata: (data.metadata || {}) as TranscriptResponse["metadata"],
    transcripts: (data.transcripts || []) as TranscriptResponse["transcripts"],
    usageInfo: data.usageInfo,
    recordingId: data.recordingId,
    status: (data.status || "processing") as TranscriptProcessingStatus,
  };
}
