import { interactionPicker } from "./interactions";
import { LANGUAGE_CODES, LANGUAGE_LABELS } from "./languages";
import type { EndpointDef, ParamPicker } from "./types";

// Dependent picker: lists facts under the interaction selected in the same form.
export const factPicker: ParamPicker = {
  fromEndpoint: "facts.list",
  // Different Corti responses use different field names; try the common ones in order.
  valueField: ["factId", "id"],
  labelFields: ["text", "group", "source"],
  parentParams: [
    {
      to: { in: "path", name: "id" },
      from: { in: "path", name: "id" },
      label: "interaction (id)",
    },
  ],
};

export const facts: EndpointDef[] = [
  {
    id: "facts.extract",
    group: "Facts",
    method: "POST",
    path: "/facts/extract",
    label: "Extract facts (standalone)",
    description: "Extract structured clinical facts from raw text. No interaction required.",
    body: {
      kind: "json",
      schema: [
        {
          name: "context",
          kind: "array",
          required: true,
          description: "One or more text snippets to extract facts from.",
          item: {
            name: "contextItem",
            kind: "object",
            fields: [
              {
                name: "type",
                kind: "enum",
                required: true,
                example: "text",
                enum: ["text", "transcript", "string"],
              },
              {
                name: "text",
                kind: "string",
                multiline: true,
                rows: 3,
                example: "Patient has a temperature of 38.5°C and reports headache.",
              },
            ],
          },
        },
        {
          name: "outputLanguage",
          kind: "enum",
          enum: LANGUAGE_CODES,
          enumLabels: LANGUAGE_LABELS,
          description: "Language the extracted facts are written in.",
          example: "en",
        },
      ],
    },
  },
  {
    id: "facts.list",
    group: "Facts",
    method: "GET",
    path: "/interactions/{id}/facts",
    label: "List facts",
    description: "List facts attached to an interaction.",
    pathParams: [{ name: "id", in: "path", required: true, picker: interactionPicker }],
    body: { kind: "none" },
  },
  {
    id: "facts.create",
    group: "Facts",
    method: "POST",
    path: "/interactions/{id}/facts",
    label: "Add facts",
    description: "Attach one or more new facts to an interaction.",
    pathParams: [{ name: "id", in: "path", required: true, picker: interactionPicker }],
    body: {
      kind: "json",
      schema: [
        {
          name: "facts",
          kind: "array",
          required: true,
          description:
            "Facts to add. Each needs at least `text`; `group` and `source` are optional.",
          item: {
            name: "fact",
            kind: "object",
            fields: [
              {
                name: "text",
                kind: "string",
                required: true,
                multiline: true,
                rows: 2,
                example: "Temperature 38.5°C",
              },
              {
                name: "group",
                kind: "string",
                description: 'Fact group (e.g. "vitals"). Use List Fact Groups to see options.',
                example: "vitals",
              },
              {
                name: "source",
                kind: "enum",
                description: 'Where the fact came from. Defaults to "user" when omitted.',
                enum: ["user", "system", "other"],
                example: "user",
              },
            ],
          },
        },
      ],
    },
  },
  {
    id: "facts.batchUpdate",
    group: "Facts",
    method: "PATCH",
    path: "/interactions/{id}/facts",
    label: "Update facts (batch)",
    description:
      "Update multiple facts in one request. Each item must carry the factId of the fact it updates.",
    pathParams: [{ name: "id", in: "path", required: true, picker: interactionPicker }],
    body: {
      kind: "json",
      schema: [
        {
          name: "facts",
          kind: "array",
          required: true,
          description: "Facts to update. Each needs a factId plus the fields you want to change.",
          item: {
            name: "fact",
            kind: "object",
            fields: [
              {
                name: "factId",
                kind: "uuid",
                required: true,
                picker: factPicker,
                example: "00000000-0000-0000-0000-000000000000",
              },
              {
                name: "text",
                kind: "string",
                multiline: true,
                rows: 2,
                example: "Temperature 39.0°C",
              },
              {
                name: "group",
                kind: "string",
                example: "vitals",
              },
              {
                name: "source",
                kind: "enum",
                enum: ["user", "system", "other"],
              },
            ],
          },
        },
      ],
    },
  },
  {
    id: "facts.update",
    group: "Facts",
    method: "PATCH",
    path: "/interactions/{id}/facts/{factId}",
    label: "Update fact",
    description: "Update a single fact. Only fields you fill in are sent.",
    pathParams: [
      { name: "id", in: "path", required: true, picker: interactionPicker },
      { name: "factId", in: "path", required: true, picker: factPicker },
    ],
    body: {
      kind: "json",
      schema: [
        {
          name: "text",
          kind: "string",
          multiline: true,
          rows: 2,
          example: "Temperature 39.0°C",
        },
        {
          name: "group",
          kind: "string",
          example: "vitals",
        },
        {
          name: "source",
          kind: "enum",
          enum: ["user", "system", "other"],
        },
      ],
    },
  },
  {
    id: "facts.groupsList",
    group: "Facts",
    method: "GET",
    // Docs don't publish the exact REST path; the SDK exposes it as factGroupsList() with no params.
    // /fact-groups is the conventional guess — if you get a 404, check the JSON tab and adjust.
    path: "/fact-groups",
    label: "List fact groups",
    description:
      "Available fact group definitions (tenant-wide). Use the returned keys as the `group` value when adding or updating facts.",
    body: { kind: "none" },
  },
];
