import { interactionPicker } from "./interactions";
import type { EndpointDef, ParamPicker } from "./types";

// Dependent picker: lists recordings under the interaction selected in the same form.
// Re-fetches whenever the `id` (interactionId) path param changes.
export const recordingPicker: ParamPicker = {
  fromEndpoint: "recordings.list",
  // Recordings might be returned with `recordingId` or `id` depending on response shape.
  valueField: ["recordingId", "id"],
  labelFields: ["status", "createdAt", "filename"],
  parentParams: [
    {
      to: { in: "path", name: "id" },
      from: { in: "path", name: "id" },
      label: "interaction (id)",
    },
  ],
};

export const recordings: EndpointDef[] = [
  {
    id: "recordings.upload",
    group: "Recordings",
    method: "POST",
    // Trailing slash is required: Corti redirects (307) from no-slash → slash, which
    // breaks binary streams when the proxy tries to follow.
    path: "/interactions/{id}/recordings/",
    label: "Upload recording",
    description:
      "Upload an audio file to an interaction. Max 60min / 150MB. Returns recordingId. " +
      "Sent as raw bytes with Content-Type: application/octet-stream. The language hint is set on Create Transcript, not here.",
    pathParams: [{ name: "id", in: "path", required: true, picker: interactionPicker }],
    body: {
      kind: "binary",
      accept: "audio/*",
      description: "Audio file (wav, mp3, m4a, webm, ogg). Max 60 min / 150 MB.",
    },
    responseSchema: [
      {
        name: "recordingId",
        kind: "uuid",
        description: "Unique identifier for the uploaded recording.",
      },
    ],
  },
  {
    id: "recordings.list",
    group: "Recordings",
    method: "GET",
    path: "/interactions/{id}/recordings",
    label: "List recordings",
    description: "List recordings attached to an interaction.",
    pathParams: [{ name: "id", in: "path", required: true, picker: interactionPicker }],
    body: { kind: "none" },
  },
  {
    id: "recordings.get",
    group: "Recordings",
    method: "GET",
    path: "/interactions/{id}/recordings/{recordingId}",
    label: "Get recording",
    description:
      "Download the raw audio bytes for a recording. Response is binary (audio/*), not JSON.",
    pathParams: [
      { name: "id", in: "path", required: true, picker: interactionPicker },
      { name: "recordingId", in: "path", required: true, picker: recordingPicker },
    ],
    body: { kind: "none" },
  },
  {
    id: "recordings.delete",
    group: "Recordings",
    method: "DELETE",
    path: "/interactions/{id}/recordings/{recordingId}",
    label: "Delete recording",
    description: "Delete a recording from an interaction.",
    pathParams: [
      { name: "id", in: "path", required: true, picker: interactionPicker },
      { name: "recordingId", in: "path", required: true, picker: recordingPicker },
    ],
    body: { kind: "none" },
  },
];
