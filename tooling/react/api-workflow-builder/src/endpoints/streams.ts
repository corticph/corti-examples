import { interactionPicker } from "./interactions";
import { LANGUAGE_CODES, LANGUAGE_LABELS } from "./languages";
import type { EndpointDef } from "./types";

// Live audio stream over WebSocket. In the *workflow* designer this is treated as a
// first-class node type: clicking Run workflow opens StreamRunModal (instead of the
// usual REST executor branch), which performs the WS dance and writes the aggregated
// transcripts + facts back into the workflow context.
//
// The body schema below is the JSON `{ type: "config", configuration: {...} }` message
// the client must send right after opening the socket — NOT an HTTP body. We model it
// as `body.kind: "json"` so the existing EndpointForm renders the config UI for free
// (runtime toggle, unique-id button, conditional rendering, etc.). The executor never
// sends this over HTTP; the modal serialises it onto the open WebSocket instead.
//
// `audioFormat` is intentionally omitted from the schema — the modal sets it from the
// negotiated MIME of the actual MicRecorder (the recorder mime is the source of truth,
// so letting the user override here would just cause CONFIG_REJECTED if they got it
// wrong).
export const streams: EndpointDef[] = [
  {
    id: "streams.connect",
    group: "Streams",
    method: "WSS",
    path: "/audio-bridge/v2/interactions/{id}/streams",
    label: "Live stream",
    description:
      "Open a real-time WebSocket against an interaction, record mic audio, and receive transcripts (~every 3s) and facts (~every 60s, or ~10s with fast_init). On Run workflow this node opens a recording modal; the aggregated output becomes the node's body for downstream substitution.",
    pathParams: [{ name: "id", in: "path", required: true, picker: interactionPicker }],
    body: {
      kind: "json",
      schema: [
        {
          name: "primaryLanguage",
          kind: "enum",
          required: true,
          enum: LANGUAGE_CODES,
          enumLabels: LANGUAGE_LABELS,
          description: "Spoken language of the audio.",
          example: "en",
        },
        {
          name: "mode",
          kind: "enum",
          required: true,
          enum: ["facts", "transcription"],
          enumLabels: {
            facts: "facts (transcripts + extracted clinical facts)",
            transcription: "transcription (transcripts only)",
          },
          description:
            "facts = transcripts + extracted clinical facts. transcription = transcripts only.",
          example: "facts",
        },
        {
          name: "outputLocale",
          kind: "enum",
          enum: LANGUAGE_CODES,
          enumLabels: LANGUAGE_LABELS,
          description:
            "Language facts are written in. Often the same as primaryLanguage. Required when mode is 'facts'.",
          example: "en",
          showWhen: { field: "mode", equals: "facts" },
        },
        {
          name: "factGenerationInterval",
          kind: "enum",
          enum: ["", "fixed", "fast_init"],
          enumLabels: {
            "": "default (fixed, ~60s)",
            fixed: "fixed (~60s)",
            fast_init: "fast_init (~10s → 20s → 26s, ramping)",
          },
          description: "How fast the server emits facts. Only used when mode is 'facts'.",
          showWhen: { field: "mode", equals: "facts" },
        },
        {
          name: "isDiarization",
          kind: "boolean",
          description: "Speaker separation on mono audio.",
        },
        {
          name: "retentionPolicy",
          kind: "enum",
          enum: ["retain", "none"],
          enumLabels: {
            retain: "retain (saved to Corti DB)",
            none: "none (ephemeral, not stored)",
          },
          description: "Whether transcripts/facts/recordings are persisted on the interaction.",
          example: "retain",
        },
        {
          name: "audioEvents",
          kind: "boolean",
          description: "Emit audio-quality + speech-activity events over the WebSocket.",
        },
      ],
    },
    responseSchema: [
      { name: "interactionId", kind: "uuid", description: "The interaction this stream ran on." },
      { name: "status", kind: "string", description: "completed | incomplete | error." },
      { name: "startedAt", kind: "datetime" },
      { name: "endedAt", kind: "datetime" },
      { name: "durationMs", kind: "number", description: "Total stream duration in milliseconds." },
      {
        name: "transcripts",
        kind: "array",
        description: "All final transcript segments accumulated during the session.",
        item: {
          name: "segment",
          kind: "object",
          fields: [
            { name: "id", kind: "uuid" },
            { name: "text", kind: "string", description: "Utterance text." },
            { name: "speakerId", kind: "number", description: "-1 when diarization is off." },
            { name: "channel", kind: "number" },
            { name: "start", kind: "number", description: "seconds" },
            { name: "end", kind: "number", description: "seconds" },
          ],
        },
      },
      {
        name: "facts",
        kind: "array",
        description:
          "All clinical facts emitted during the session. Empty when mode is 'transcription'.",
        item: {
          name: "fact",
          kind: "object",
          fields: [
            { name: "id", kind: "uuid" },
            { name: "text", kind: "string" },
            { name: "group", kind: "string", description: "e.g. medical-history." },
          ],
        },
      },
    ],
  },
];
