import { LANGUAGE_CODES, LANGUAGE_LABELS } from "./languages";
import type { EndpointDef } from "./types";

// Stateless real-time dictation over WSS. Distinct from /streams — no interactionId,
// no facts mode, no retention policy. Just primaryLanguage + transcript settings +
// optional commands/replacements/keyterms.
//
// The "body" schema here mirrors the `{ type: "config", configuration: {...} }` message
// the client sends right after the socket opens — NOT an HTTP body. Same pattern as
// streams.connect: we model it as a json body for the form-rendering, but the runner
// serialises it onto the WebSocket instead of into an HTTP request.
export const transcribe: EndpointDef[] = [
  {
    id: "transcribe.connect",
    group: "Transcribe",
    method: "WSS",
    path: "/audio-bridge/v2/transcribe",
    label: "Live transcribe",
    description:
      "Stateless real-time dictation. Open a WebSocket, send a config message, push mic or file audio in real time, receive interim + final transcripts. No interaction binding — use /streams for ambient-conversation workflows tied to an interaction.",
    body: {
      kind: "json",
      schema: [
        {
          name: "primaryLanguage",
          kind: "enum",
          required: true,
          enum: LANGUAGE_CODES,
          enumLabels: LANGUAGE_LABELS,
          description: "Spoken language locale (BCP 47).",
          example: "en",
        },
        {
          name: "interimResults",
          kind: "boolean",
          description:
            "When true, interim (preview) transcript results with isFinal=false arrive faster than final ones.",
        },
        {
          name: "spokenPunctuation",
          kind: "boolean",
          description:
            'Convert spoken punctuation words ("period", "slash") into the actual characters (`.`, `/`). Mutually exclusive with automaticPunctuation — if both true, this wins.',
        },
        {
          name: "automaticPunctuation",
          kind: "boolean",
          description: "Auto-punctuate + capitalize the final transcript.",
        },
        {
          name: "audioEvents",
          kind: "boolean",
          description:
            "Emit audio quality + speech-activity events on the WS (speech quality issue/recovered, long silence).",
        },
        {
          name: "formatting",
          kind: "object",
          description:
            "Output formatting preferences. Each field is optional — when omitted the listed default applies. See the docs for full enum lists per field.",
          fields: [
            {
              name: "dates",
              kind: "enum",
              enum: ["locale:long", "locale:medium", "locale:short", "iso", "as_dictated"],
            },
            { name: "times", kind: "enum", enum: ["locale", "h24", "h12"] },
            {
              name: "numbers",
              kind: "enum",
              enum: ["numerals_above_nine", "numerals", "as_dictated"],
            },
            { name: "measurements", kind: "enum", enum: ["abbreviated", "as_dictated"] },
            { name: "numericRanges", kind: "enum", enum: ["numerals", "as_dictated"] },
            {
              name: "ordinals",
              kind: "enum",
              enum: ["numerals_above_nine", "numerals", "as_dictated"],
            },
          ],
        },
        {
          name: "commands",
          kind: "array",
          description:
            "Dictation commands the server should recognise during recording. Each command has an id + one or more trigger phrases.",
          item: {
            name: "command",
            kind: "object",
            fields: [
              {
                name: "id",
                kind: "string",
                required: true,
                description: "Unique id returned when the command fires.",
              },
              {
                name: "phrases",
                kind: "array",
                required: true,
                description: "Spoken triggers for this command.",
                item: { name: "phrase", kind: "string" },
              },
              {
                name: "variables",
                kind: "array",
                description:
                  "Placeholders used inside phrases (e.g. `select {text}`). enum-type fills from a fixed list; wildcard captures free text.",
                item: {
                  name: "variable",
                  kind: "object",
                  fields: [
                    { name: "key", kind: "string", required: true },
                    { name: "type", kind: "enum", required: true, enum: ["enum", "wildcard"] },
                    {
                      name: "enum",
                      kind: "array",
                      description: "Required when type=enum.",
                      item: { name: "value", kind: "string" },
                      showWhen: { field: "type", equals: "enum" },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          name: "replacements",
          kind: "array",
          description:
            "Find/replace pairs applied to the final transcript (case-insensitive). Cap: 1,000 items.",
          item: {
            name: "replacement",
            kind: "object",
            fields: [
              { name: "find", kind: "string", required: true },
              { name: "replace", kind: "string", required: true },
            ],
          },
        },
        {
          name: "keyterms",
          kind: "object",
          description:
            "Custom vocabulary the recogniser should bias toward. Useful for proper nouns and rarely-recognised words.",
          fields: [
            {
              name: "terms",
              kind: "array",
              item: {
                name: "term",
                kind: "object",
                fields: [{ name: "term", kind: "string", required: true }],
              },
            },
          ],
        },
      ],
    },
    responseSchema: [
      {
        name: "transcripts",
        kind: "array",
        description: "Final transcript text segments accumulated during the session.",
        item: {
          name: "segment",
          kind: "object",
          fields: [
            { name: "text", kind: "string" },
            { name: "isFinal", kind: "boolean" },
            { name: "start", kind: "number" },
            { name: "end", kind: "number" },
          ],
        },
      },
      {
        name: "commands",
        kind: "array",
        description: "Commands the server recognised during the session.",
        item: {
          name: "command",
          kind: "object",
          fields: [
            { name: "id", kind: "string" },
            { name: "phrase", kind: "string" },
            { name: "variables", kind: "json" },
          ],
        },
      },
      { name: "startedAt", kind: "datetime" },
      { name: "endedAt", kind: "datetime" },
      { name: "durationMs", kind: "number" },
    ],
  },
];
