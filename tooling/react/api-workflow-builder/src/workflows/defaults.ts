import type { Workflow } from "./types";

// Starter workflows shipped as defaults on the very first launch — when the user's
// localStorage has no workflows AND the seed marker (see SEED_MARKER_KEY below) hasn't
// been set. Once seeded, users can freely rename / edit / delete these without the
// defaults returning on subsequent loads (the marker sticks even when the workflow
// list goes empty). That's important: seeding must never overwrite user data or bring
// back workflows the user deliberately removed.
//
// To ship a new default: run a workflow you like, click "Export all" on the workflows
// list page to copy the JSON, paste one workflow object into this array. Sanitise any
// tenant-specific IDs (users, patients, real interaction IDs) — either blank them out
// and mark them as runtime, or add them to autoGenerateFields so they regenerate per
// run. Keep ids stable across releases so returning users don't accumulate duplicates.
//
// Bump SEED_MARKER_KEY (e.g. `.v3`) when the defaults change in a way that existing
// installs should pick up.

export const DEFAULT_WORKFLOWS: Workflow[] = [
  {
    id: "d9743b88-47e5-434f-82d7-dedad01e8f9a",
    name: "Generate document from stream",
    description:
      "Create an interaction, open a Streams WSS to record and extract facts, generate a SOAP document from the facts, then clean up.",
    nodes: [
      {
        id: "b63bc171-01f4-4c71-920e-c8b04aa7aba8",
        ref: "interactions_create_1",
        endpointId: "interactions.create",
        position: { x: -458.3, y: -1440.8 },
        values: {
          path: {},
          query: {},
          headers: {},
          body: '{\n  "encounter": {\n    "identifier": "",\n    "title": "workflow",\n    "period": {\n      "startedAt": "2026-05-13T08:00:00Z",\n      "endedAt": "2026-05-13T09:00:00Z"\n    },\n    "status": "planned",\n    "type": "first_consultation"\n  },\n  "patient": {\n    "identifier": "",\n    "name": "workflow"\n  },\n  "assignedUserId": ""\n}',
        },
        runtimeFields: ["body.assignedUserId"],
        autoGenerateFields: ["body.encounter.identifier", "body.patient.identifier"],
      },
      {
        id: "a59e2ba7-b7f6-46ac-99f9-eafc3451c191",
        ref: "streams_connect_1",
        endpointId: "streams.connect",
        position: { x: -152.6, y: -1522.3 },
        values: {
          path: { id: "{{interactions_create_1.interactionId}}" },
          query: {},
          headers: {},
          body: '{\n  "primaryLanguage": "en-US",\n  "mode": "facts",\n  "outputLocale": "en-US",\n  "factGenerationInterval": "fast_init"\n}',
        },
      },
      {
        id: "dbf4683a-8069-4d01-9624-467803abd78f",
        ref: "documents_create_1",
        endpointId: "documents.create",
        position: { x: 251.7, y: -1412.2 },
        values: {
          path: { id: "{{interactions_create_1.interactionId}}" },
          query: {},
          headers: {},
          body: '{\n  "context": [\n    {\n      "type": "facts",\n      "data": "{{streams_connect_1.facts}}"\n    }\n  ],\n  "templateKey": "corti-soap",\n  "outputLanguage": "en-GB"\n}',
        },
      },
      {
        id: "9c01ada1-dfc7-478d-9671-0fc81a9874f2",
        ref: "interactions_delete_1",
        endpointId: "interactions.delete",
        position: { x: 639.1, y: -1293.2 },
        values: {
          path: { id: "{{interactions_create_1.interactionId}}" },
          query: {},
          headers: {},
          body: "",
        },
      },
    ],
    edges: [
      {
        id: "41ae8e3b-edb9-4af5-b153-d81b747bcee7",
        source: "b63bc171-01f4-4c71-920e-c8b04aa7aba8",
        target: "a59e2ba7-b7f6-46ac-99f9-eafc3451c191",
      },
      {
        id: "e5d7f435-2428-43b3-9132-1d551adc30ef",
        source: "a59e2ba7-b7f6-46ac-99f9-eafc3451c191",
        target: "dbf4683a-8069-4d01-9624-467803abd78f",
      },
      {
        id: "fff48c12-6dba-4dd6-90c6-cb5f383522e7",
        source: "dbf4683a-8069-4d01-9624-467803abd78f",
        target: "9c01ada1-dfc7-478d-9671-0fc81a9874f2",
      },
    ],
    createdAt: "2026-05-19T07:54:49.722Z",
    updatedAt: "2026-07-29T11:55:56.371Z",
  },
  {
    id: "cfa63b47-48d3-4393-a4c1-5c96a453ed2e",
    name: "Upload file, create document, predict codes",
    description:
      "Create an interaction, upload an audio file, transcribe it, generate a SOAP document, predict ICD-10 codes from the document, then clean up.",
    nodes: [
      {
        id: "db9a3494-0f14-48f1-8f9b-d8d62d24c8f9",
        ref: "interactions_create_1",
        endpointId: "interactions.create",
        position: { x: 325.5, y: -4.2 },
        values: {
          path: {},
          query: {},
          headers: {},
          body: '{\n  "encounter": {\n    "identifier": "",\n    "status": "planned",\n    "type": "first_consultation"\n  },\n  "patient": {\n    "identifier": ""\n  },\n  "assignedUserId": ""\n}',
        },
        runtimeFields: ["body.assignedUserId"],
        autoGenerateFields: ["body.encounter.identifier", "body.patient.identifier"],
      },
      {
        id: "6fc49cf4-1f56-4502-8448-9a2beaa62b2e",
        ref: "recordings_upload_1",
        endpointId: "recordings.upload",
        position: { x: 637.5, y: 162.9 },
        values: {
          path: { id: "{{interactions_create_1.interactionId}}" },
          query: {},
          headers: {},
          body: "",
        },
      },
      {
        id: "be1f9d40-4801-4c61-9809-564b71de9691",
        ref: "transcripts_create_1",
        endpointId: "transcripts.create",
        position: { x: 965.5, y: 8.9 },
        values: {
          path: { id: "{{interactions_create_1.interactionId}}" },
          query: {},
          headers: {},
          body: '{\n  "recordingId": "{{recordings_upload_1.recordingId}}",\n  "primaryLanguage": "fr"\n}',
        },
      },
      {
        id: "d0720a22-4e08-4e61-ae11-95596ce89ebe",
        ref: "documents_create_1",
        endpointId: "documents.create",
        position: { x: 1259.5, y: 111.5 },
        values: {
          path: { id: "{{interactions_create_1.interactionId}}" },
          query: {},
          headers: {},
          body: '{\n  "context": [\n    {\n      "type": "transcript",\n      "data": "{{transcripts_create_1.transcripts}}"\n    }\n  ],\n  "templateKey": "corti-soap",\n  "outputLanguage": "fr"\n}',
        },
      },
      {
        id: "b8dfc502-3274-400f-b04a-1b217c917efc",
        ref: "codes_predict_1",
        endpointId: "codes.predict",
        position: { x: 1604.5, y: 226.9 },
        values: {
          path: {},
          query: {},
          headers: {},
          body: '{\n  "system": "icd10cm-inpatient",\n  "context": [\n    {\n      "type": "documentId",\n      "_interactionId": "{{interactions_create_1.interactionId}}",\n      "documentId": "{{documents_create_1.id}}"\n    }\n  ]\n}',
        },
      },
      {
        id: "c91c19fa-0629-45f8-a5e8-153b8e0269f1",
        ref: "interactions_delete_1",
        endpointId: "interactions.delete",
        position: { x: 1938.5, y: 88.4 },
        values: {
          path: { id: "{{interactions_create_1.interactionId}}" },
          query: {},
          headers: {},
          body: "",
        },
      },
    ],
    edges: [
      {
        id: "8a904c37-b96b-438b-9afe-7a13a16e8064",
        source: "db9a3494-0f14-48f1-8f9b-d8d62d24c8f9",
        target: "6fc49cf4-1f56-4502-8448-9a2beaa62b2e",
      },
      {
        id: "c01aae0a-f325-46b3-b185-27c9f8681a6a",
        source: "6fc49cf4-1f56-4502-8448-9a2beaa62b2e",
        target: "be1f9d40-4801-4c61-9809-564b71de9691",
      },
      {
        id: "14057e57-4e7b-4ceb-a113-f56f7e845a6d",
        source: "be1f9d40-4801-4c61-9809-564b71de9691",
        target: "d0720a22-4e08-4e61-ae11-95596ce89ebe",
      },
      {
        id: "7107f8dd-a289-43ee-8f16-e8f1eb565eda",
        source: "d0720a22-4e08-4e61-ae11-95596ce89ebe",
        target: "b8dfc502-3274-400f-b04a-1b217c917efc",
      },
      {
        id: "bcb2f033-eddc-4fb6-8afa-a6bb7a851113",
        source: "b8dfc502-3274-400f-b04a-1b217c917efc",
        target: "c91c19fa-0629-45f8-a5e8-153b8e0269f1",
      },
    ],
    createdAt: "2026-06-09T15:07:27.822Z",
    updatedAt: "2026-07-22T10:52:55.753Z",
  },
  {
    id: "eba6a5b6-b842-4f69-9bab-02dbbea6b476",
    name: "Agents: send a message with a file attachment",
    description:
      "Create an orchestrator agent with a memory expert, send a message with an attached PDF for the agent to analyse, then delete the agent.",
    nodes: [
      {
        id: "da1aae8c-0e0c-408c-9175-dad1b950e46d",
        ref: "agents_create_1",
        endpointId: "agents.create",
        position: { x: 159.1, y: 198.5 },
        values: {
          path: {},
          query: {},
          headers: {},
          body: '{\n  "name": "test",\n  "description": "test agent",\n  "agentType": "orchestrator",\n  "systemPrompt": "You are a helpful clinical assistant. When a file is attached, use the memory expert to read and analyse it, then summarise the key points.",\n  "experts": [\n    { "type": "reference", "name": "memory-expert" }\n  ]\n}\n',
        },
      },
      {
        id: "155af80b-b817-4a73-a94c-329aad084a5e",
        ref: "agents_messagesend_1",
        endpointId: "agents.messageSend",
        position: { x: 576.6, y: 150.4 },
        values: {
          path: { id: "{{agents_create_1.id}}" },
          query: {},
          headers: {},
          body: '{\n  "message": {\n    "kind": "message",\n    "role": "user",\n    "messageId": "",\n    "parts": [\n      {\n        "kind": "text",\n        "text": "Analyse the attached file and summarise it."\n      },\n      {\n        "kind": "file",\n        "file": {\n          "bytes": "JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjEgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iagozIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhLUJvbGQgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0YyIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKNCAwIG9iago8PAovQ29udGVudHMgOCAwIFIgL01lZGlhQm94IFsgMCAwIDU5NS4yNzU2IDg0MS44ODk4IF0gL1BhcmVudCA3IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9QYWdlTW9kZSAvVXNlTm9uZSAvUGFnZXMgNyAwIFIgL1R5cGUgL0NhdGFsb2cKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0F1dGhvciAoYW5vbnltb3VzKSAvQ3JlYXRpb25EYXRlIChEOjIwMjYwNjI2MTE1MjA2KzAwJzAwJykgL0NyZWF0b3IgKGFub255bW91cykgL0tleXdvcmRzICgpIC9Nb2REYXRlIChEOjIwMjYwNjI2MTE1MjA2KzAwJzAwJykgL1Byb2R1Y2VyIChSZXBvcnRMYWIgUERGIExpYnJhcnkgLSBcKG9wZW5zb3VyY2VcKSkgCiAgL1N1YmplY3QgKHVuc3BlY2lmaWVkKSAvVGl0bGUgKHVudGl0bGVkKSAvVHJhcHBlZCAvRmFsc2UKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0NvdW50IDEgL0tpZHMgWyA0IDAgUiBdIC9UeXBlIC9QYWdlcwo+PgplbmRvYmoKOCAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCA0NDkKPj4Kc3RyZWFtCkdhc0pOOyw7ZnUnU1lIPS8nYW9ZYV8xamRuYERUbkJWbU09NUw7XFRsQDlMTjZNQmxdIi9fUU0pJGdiXjRsPHM5RSNEbyw9U24pIT9rSGhRQFVMMicoPGdoXjZ1K25SVVVKSWFLIW1qZXBlUklSTGFnQWRqcyVyZicxbF09ZThfJiZfVlFMNTchLy90cTN1aC5uTjRuKllfciZyPz9CP146MHMrLydiP2pFLkJKM1pAXEc5QEwyYFBKMDpVO0NAM3Q2KE8lSEw1OzRAPW0sNlczMjJmUTpNSzBhMypuIWJkP1ZrVm5lUDtOJkEpUCFVND0obkAmMy4wOUIsPkJLLC9lQmtWNWdbPHRhb21eMC43QEYpbzFWKktfRkRJalx1SCpNKHM0cihsYzFlaj8jM04rJzU/aS5laWpfUEsyYm0qVTJLZkdgOWVxUVVwLC5BVVlhSCVBUz1YZWIvOl8wIWtCX3Q6Ki5hJVcrW2k9SmM+OmNUUHJRLC8oc11hTXBkWEIkNTY2R0EmVGRZN3Q2QixtX25TR0I7SURBbkBnTHViIzU6N0ZUbDZzVXM7Ikw3akktUFM/anBHIV5dTjgkTn4+ZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgOQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNjEgMDAwMDAgbiAKMDAwMDAwMDEwMiAwMDAwMCBuIAowMDAwMDAwMjA5IDAwMDAwIG4gCjAwMDAwMDAzMjEgMDAwMDAgbiAKMDAwMDAwMDUyNCAwMDAwMCBuIAowMDAwMDAwNTkyIDAwMDAwIG4gCjAwMDAwMDA4NTMgMDAwMDAgbiAKMDAwMDAwMDkxMiAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9JRCAKWzxjNjVmZGJmYWQwNGNmZGU2YWY2ODdiMmU3ODA3ODIzYT48YzY1ZmRiZmFkMDRjZmRlNmFmNjg3YjJlNzgwNzgyM2E+XQolIFJlcG9ydExhYiBnZW5lcmF0ZWQgUERGIGRvY3VtZW50IC0tIGRpZ2VzdCAob3BlbnNvdXJjZSkKCi9JbmZvIDYgMCBSCi9Sb290IDUgMCBSCi9TaXplIDkKPj4Kc3RhcnR4cmVmCjE0NTEKJSVFT0YK",\n          "name": "discharge.pdf",\n          "mimeType": "application/pdf"\n        }\n      }\n    ]\n  }\n}',
        },
        autoGenerateFields: ["body.message.messageId"],
      },
      {
        id: "d37d2810-bbfb-4986-af7e-363da05383eb",
        ref: "agents_delete_1",
        endpointId: "agents.delete",
        position: { x: 1102.5, y: 188.3 },
        values: {
          path: { id: "{{agents_create_1.id}}" },
          query: {},
          headers: {},
          body: "",
        },
      },
    ],
    edges: [
      {
        id: "e11f9881-4bfd-45a0-bf9a-20b5de1805e8",
        source: "da1aae8c-0e0c-408c-9175-dad1b950e46d",
        target: "155af80b-b817-4a73-a94c-329aad084a5e",
      },
      {
        id: "2cf6ecd6-3a08-483b-af9f-210a301edbbd",
        source: "155af80b-b817-4a73-a94c-329aad084a5e",
        target: "d37d2810-bbfb-4986-af7e-363da05383eb",
      },
    ],
    createdAt: "2026-06-10T14:56:30.405Z",
    updatedAt: "2026-07-29T14:00:00.000Z",
  },
];

// localStorage key set to "1" after we've attempted to seed at least once. Prevents
// re-seeding after a user has intentionally cleared everything. Bump the suffix when
// shipping new defaults that existing installs should pick up on their next load.
export const SEED_MARKER_KEY = "corti.workflows.seeded.v2";
