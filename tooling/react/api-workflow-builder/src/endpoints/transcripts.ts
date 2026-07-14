import { interactionPicker } from "./interactions";
import { LANGUAGE_CODES, LANGUAGE_LABELS } from "./languages";
import { recordingPicker } from "./recordings";
import type { EndpointDef, ParamPicker, ResponseField } from "./types";

// Shared response shape for transcripts.create / transcripts.get. Drives the
// "Available from upstream" picker in the workflow editor.
const transcriptResponse: ResponseField[] = [
  { name: "id", kind: "uuid", description: "The transcript id." },
  { name: "recordingId", kind: "uuid", description: "Recording this transcript came from." },
  { name: "status", kind: "enum", description: "processing / completed / failed." },
  {
    name: "transcripts",
    kind: "array",
    description: "Per-utterance text segments.",
    item: {
      name: "segment",
      kind: "object",
      fields: [
        { name: "text", kind: "string", description: "Utterance text." },
        { name: "channel", kind: "number" },
        { name: "participant", kind: "number" },
        { name: "start", kind: "number", description: "Start time (seconds)." },
        { name: "end", kind: "number", description: "End time (seconds)." },
      ],
    },
  },
];

// Simple picker that lists transcripts under the current interaction and selects one by id.
// Used on path params like transcriptId on transcripts.get / transcripts.status.
export const transcriptPicker: ParamPicker = {
  fromEndpoint: "transcripts.list",
  valueField: ["transcriptId", "id"],
  labelFields: ["status", "primaryLanguage", "createdAt"],
  parentParams: [
    {
      to: { in: "path", name: "id" },
      from: { in: "path", name: "id" },
      label: "interaction (id)",
    },
  ],
};

// Same as transcriptPicker, but on select also fetches the full transcript content
// and pastes it (the entire transcripts.get response) into the target field. ONE form item,
// full content visible. At send time, documents.create.preSendTransform spreads the segments
// into one wire-level context item per segment — so the form stays clean while Corti still
// gets the per-segment shape it wants for best quality.
export const transcriptContentPicker: ParamPicker = {
  ...transcriptPicker,
  fetchOnSelect: {
    endpoint: "transcripts.get",
    valueParam: "transcriptId",
  },
};

export const transcripts: EndpointDef[] = [
  {
    id: "transcripts.create",
    group: "Transcripts",
    method: "POST",
    path: "/interactions/{id}/transcripts",
    label: "Create transcript",
    description: "Start an async transcript for a recording.",
    pathParams: [{ name: "id", in: "path", required: true, picker: interactionPicker }],
    body: {
      kind: "json",
      schema: [
        {
          name: "recordingId",
          kind: "uuid",
          required: true,
          description: "The recording to transcribe (uploaded via Upload Recording).",
          example: "00000000-0000-0000-0000-000000000000",
          picker: recordingPicker,
        },
        {
          name: "primaryLanguage",
          kind: "enum",
          required: true,
          enum: LANGUAGE_CODES,
          enumLabels: LANGUAGE_LABELS,
          description: "Primary spoken language in the audio.",
          example: "en",
        },
        {
          name: "diarization",
          kind: "boolean",
          description: "Whether to attempt speaker diarization.",
        },
        {
          name: "participants",
          kind: "array",
          description: "Channel-to-role mapping for multichannel recordings.",
          item: {
            name: "participant",
            kind: "object",
            fields: [
              {
                name: "channel",
                kind: "number",
                required: true,
                example: 0,
              },
              {
                name: "role",
                kind: "enum",
                required: true,
                example: "doctor",
                enum: ["doctor", "patient", "other"],
              },
            ],
          },
        },
      ],
    },
    responseSchema: transcriptResponse,
  },
  {
    id: "transcripts.list",
    group: "Transcripts",
    method: "GET",
    path: "/interactions/{id}/transcripts",
    label: "List transcripts",
    description: "List transcripts attached to an interaction.",
    pathParams: [{ name: "id", in: "path", required: true, picker: interactionPicker }],
    body: { kind: "none" },
  },
  {
    id: "transcripts.status",
    group: "Transcripts",
    method: "GET",
    path: "/interactions/{id}/transcripts/{transcriptId}/status",
    label: "Get transcript status",
    description: "Poll the status of an in-flight transcription.",
    pathParams: [
      { name: "id", in: "path", required: true, picker: interactionPicker },
      { name: "transcriptId", in: "path", required: true, picker: transcriptPicker },
    ],
    body: { kind: "none" },
  },
  {
    id: "transcripts.get",
    group: "Transcripts",
    method: "GET",
    path: "/interactions/{id}/transcripts/{transcriptId}",
    label: "Get transcript",
    description: "Fetch a finished transcript.",
    pathParams: [
      { name: "id", in: "path", required: true, picker: interactionPicker },
      { name: "transcriptId", in: "path", required: true, picker: transcriptPicker },
    ],
    body: { kind: "none" },
    responseSchema: transcriptResponse,
  },
  {
    id: "transcripts.delete",
    group: "Transcripts",
    method: "DELETE",
    path: "/interactions/{id}/transcripts/{transcriptId}",
    label: "Delete transcript",
    description: "Delete a transcript from an interaction.",
    pathParams: [
      { name: "id", in: "path", required: true, picker: interactionPicker },
      { name: "transcriptId", in: "path", required: true, picker: transcriptPicker },
    ],
    body: { kind: "none" },
  },
];
