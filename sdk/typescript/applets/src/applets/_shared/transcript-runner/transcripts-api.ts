import { buildApiUrl } from "../../_shared/urls";
import type {
  InteractionSummary,
  TranscriptCreateRequest,
  TranscriptCreateResult,
  TranscriptProcessingStatus,
  TranscriptResponse,
} from "./model";
import { resolveTranscriptIdFromCreateResponse } from "./model";

const API_BASE = `${buildApiUrl()}/v2`;
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 120;

interface ApiErrorBody {
  detail?: string;
  message?: string;
  type?: string;
  status?: number;
}

interface RawInteraction {
  id: string;
  encounter?: {
    title?: string;
  };
  patient?: {
    name?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface ListInteractionsResponse {
  interactions?: RawInteraction[];
}

interface ListRecordingsResponse {
  recordings?: string[];
}

interface CreateInteractionResponse {
  interactionId?: string;
}

interface UploadRecordingResponse {
  recordingId?: string;
}

interface TranscriptStatusResponse {
  status?: TranscriptProcessingStatus;
}

function getApiErrorMessage(
  response: Response,
  body: ApiErrorBody | null | undefined,
): string {
  return (
    body?.detail ||
    body?.message ||
    body?.type ||
    `${response.status} ${response.statusText}`.trim() ||
    `HTTP ${response.status}`
  );
}

async function readJsonBody<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  return JSON.parse(text) as T;
}

async function expectOkJson<T>(response: Response): Promise<T> {
  const body = await readJsonBody<T & ApiErrorBody>(response).catch(() => null);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, body));
  }
  return (body || {}) as T;
}

function createInteractionPayload() {
  return {
    assignedUserId: null,
    encounter: {
      identifier: `corti-examples-${Date.now()}`,
      status: "planned",
      type: "consultation",
      period: {
        start: new Date().toISOString(),
        end: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      title: "Corti Examples Session",
    },
    patient: {
      identifier: "test-patient-1",
      name: "Test Patient",
      gender: "unknown",
      birthDate: "1990-01-01T00:00:00Z",
      pronouns: "They/Them",
    },
  };
}

export async function listInteractions(): Promise<InteractionSummary[]> {
  const response = await fetch(`${API_BASE}/interactions/`);
  const data = await expectOkJson<ListInteractionsResponse>(response);
  return (data.interactions || [])
    .map((interaction) => ({
      id: interaction.id,
      title: interaction.encounter?.title || "Untitled interaction",
      patientName: interaction.patient?.name || "Unknown patient",
      createdAt: interaction.createdAt,
      updatedAt: interaction.updatedAt,
    }))
    .sort((a, b) => {
      const left = Date.parse(b.updatedAt || b.createdAt || "") || 0;
      const right = Date.parse(a.updatedAt || a.createdAt || "") || 0;
      return left - right;
    });
}

export async function createExamplesInteraction(): Promise<string> {
  const response = await fetch(`${API_BASE}/interactions/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createInteractionPayload()),
  });
  const data = await expectOkJson<CreateInteractionResponse>(response);
  if (!data.interactionId) {
    throw new Error("Interaction creation response was missing interactionId.");
  }
  return data.interactionId;
}

export async function listRecordings(interactionId: string): Promise<string[]> {
  const response = await fetch(
    `${API_BASE}/interactions/${encodeURIComponent(interactionId)}/recordings/`,
  );
  const data = await expectOkJson<ListRecordingsResponse>(response);
  return data.recordings || [];
}

export async function uploadRecording(
  interactionId: string,
  file: File,
): Promise<string> {
  const response = await fetch(
    `${API_BASE}/interactions/${encodeURIComponent(interactionId)}/recordings/`,
    {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    },
  );
  const data = await expectOkJson<UploadRecordingResponse>(response);
  if (!data.recordingId) {
    throw new Error("Recording upload response was missing recordingId.");
  }
  return data.recordingId;
}

export async function createTranscript(
  interactionId: string,
  request: TranscriptCreateRequest,
): Promise<TranscriptCreateResult> {
  const response = await fetch(
    `${API_BASE}/interactions/${encodeURIComponent(interactionId)}/transcripts/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  const body = await readJsonBody<Partial<TranscriptResponse> & ApiErrorBody>(
    response,
  ).catch(() => null);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(response, body));
  }

  return {
    transcriptId: resolveTranscriptIdFromCreateResponse(
      body,
      response.headers.get("Location"),
    ),
    status: body?.status || "processing",
  };
}

export async function getTranscriptStatus(
  interactionId: string,
  transcriptId: string,
): Promise<TranscriptProcessingStatus> {
  const response = await fetch(
    `${API_BASE}/interactions/${encodeURIComponent(interactionId)}/transcripts/${encodeURIComponent(transcriptId)}/status`,
  );
  const data = await expectOkJson<TranscriptStatusResponse>(response);
  if (
    data.status !== "processing" &&
    data.status !== "completed" &&
    data.status !== "failed"
  ) {
    throw new Error("Transcript status response was missing a valid status.");
  }
  return data.status;
}

export async function pollTranscriptUntilReady(
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
    const status = await getTranscriptStatus(interactionId, transcriptId);
    options?.onStatus?.(status);
    if (status !== "processing") {
      return status;
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, intervalMs));
  }

  throw new Error("Timed out waiting for transcript processing to complete.");
}

export async function getTranscript(
  interactionId: string,
  transcriptId: string,
): Promise<TranscriptResponse> {
  const response = await fetch(
    `${API_BASE}/interactions/${encodeURIComponent(interactionId)}/transcripts/${encodeURIComponent(transcriptId)}`,
  );
  const data = await expectOkJson<TranscriptResponse>(response);
  if (!data.id || !data.recordingId) {
    throw new Error("Transcript response was missing required identifiers.");
  }
  return {
    ...data,
    metadata: data.metadata || {},
    transcripts: data.transcripts || [],
    status: data.status || "processing",
  };
}
