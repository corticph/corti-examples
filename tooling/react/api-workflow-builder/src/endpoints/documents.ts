import { interactionPicker } from "./interactions";
import { LANGUAGE_CODES, LANGUAGE_LABELS } from "./languages";
import { transcriptContentPicker } from "./transcripts";
import type { BodyField, EndpointDef, ParamPicker } from "./types";

// Picker that lists documents under the interaction selected in the same form's path params.
// For body-level use (e.g. predict-codes where there's no interaction in the path), define
// a body-mode variant inline at the call site.
export const documentPicker: ParamPicker = {
  fromEndpoint: "documents.list",
  valueField: ["documentId", "id"],
  labelFields: ["name", "templateKey", "status", "createdAt"],
  parentParams: [
    {
      to: { in: "path", name: "id" },
      from: { in: "path", name: "id" },
      label: "interaction (id)",
    },
  ],
};

// Built-in Corti document templates with friendly labels.
const TEMPLATE_KEYS = [
  "corti-soap",
  "corti-brief-clinical-note",
  "corti-h-and-p",
  "corti-emergency-note",
  "corti-nursing-note",
  "corti-patient-summary",
  "corti-epic-avr",
  "corti-outpatient-visit-note",
  "corti-emergency-response-note",
  "corti-referral",
];

const TEMPLATE_LABELS: Record<string, string> = {
  "corti-soap": "corti-soap — Classic SOAP note",
  "corti-brief-clinical-note": "corti-brief-clinical-note — One-paragraph encounter summary",
  "corti-h-and-p": "corti-h-and-p — History and Physical",
  "corti-emergency-note": "corti-emergency-note — Comprehensive ED note",
  "corti-nursing-note": "corti-nursing-note — Brief nursing note",
  "corti-patient-summary": "corti-patient-summary — Patient-facing summary",
  "corti-epic-avr": "corti-epic-avr — For Epic Ambient Voice Recognition integration",
  "corti-outpatient-visit-note": "corti-outpatient-visit-note — Universal outpatient note",
  "corti-emergency-response-note":
    "corti-emergency-response-note — Emergency service response (5Ws)",
  "corti-referral": "corti-referral — Referral to another professional",
};

const contextItemField: BodyField = {
  name: "contextItem",
  kind: "object",
  fields: [
    {
      name: "type",
      kind: "enum",
      required: true,
      example: "string",
      enum: ["string", "transcript", "facts", "text"],
    },
    {
      name: "data",
      kind: "json",
      rows: 10,
      description:
        "For type=string send plain text in quotes; for type=transcript/facts paste the structured JSON. " +
        "The Import picker pastes the full Get Transcript response here as one item — at send time it's automatically split into one wire-level context item per segment (which is what Corti expects for best document quality).",
      example: "Patient presents with chest pain for three days.",
      picker: transcriptContentPicker,
      pickerMode: "helper",
    },
  ],
};

export const documents: EndpointDef[] = [
  {
    id: "documents.create",
    group: "Documents",
    method: "POST",
    path: "/interactions/{id}/documents",
    label: "Generate document",
    description: "Generate a clinical document from interaction context using a template.",
    pathParams: [{ name: "id", in: "path", required: true, picker: interactionPicker }],
    // Form-side: user keeps ONE friendly item with the whole transcripts.get response in `data`.
    // Wire-side: spread into one item per segment (Corti's CommonTranscript shape) for best quality.
    preSendTransform: (body: unknown): unknown => {
      if (!body || typeof body !== "object") return body;
      const obj = body as Record<string, unknown>;
      const ctx = obj.context;
      if (!Array.isArray(ctx)) return body;
      const expanded: unknown[] = [];
      for (const raw of ctx) {
        const item = raw as Record<string, unknown> | null;
        if (item && item.type === "transcript") {
          const data = item.data as Record<string, unknown> | unknown[] | null;
          // Case 1: data is the full transcripts.get response (has a `transcripts` array)
          if (data && !Array.isArray(data) && Array.isArray((data as any).transcripts)) {
            for (const segment of (data as any).transcripts) {
              expanded.push({ type: "transcript", data: segment });
            }
            continue;
          }
          // Case 2: data is already an array of segment objects
          if (Array.isArray(data)) {
            for (const segment of data) {
              expanded.push({ type: "transcript", data: segment });
            }
            continue;
          }
        }
        // Default: pass the item through unchanged
        expanded.push(raw);
      }
      return { ...obj, context: expanded };
    },
    body: {
      kind: "json",
      schema: [
        {
          name: "context",
          kind: "array",
          required: true,
          description: "One or more context items the document is generated from.",
          item: contextItemField,
        },
        {
          name: "templateKey",
          kind: "enum",
          required: true,
          enum: TEMPLATE_KEYS,
          enumLabels: TEMPLATE_LABELS,
          allowCustom: true,
          description:
            "Pick a built-in template, or use Manual to type a custom key from your tenant.",
          example: "corti-soap",
        },
        {
          name: "outputLanguage",
          kind: "enum",
          required: true,
          enum: LANGUAGE_CODES,
          enumLabels: LANGUAGE_LABELS,
          description: "Language the generated document is written in.",
          example: "en",
        },
        {
          name: "name",
          kind: "string",
          description: "Optional human-readable name for the document.",
          example: "Clinical note",
        },
      ],
    },
    responseSchema: [
      { name: "id", kind: "uuid", description: "The generated document id." },
      { name: "name", kind: "string", description: "Document name." },
      { name: "templateRef", kind: "string", description: "Template key used." },
      { name: "outputLanguage", kind: "string" },
      { name: "createdAt", kind: "datetime" },
      { name: "updatedAt", kind: "datetime" },
      {
        name: "sections",
        kind: "array",
        description: "Generated content per section.",
        item: {
          name: "section",
          kind: "object",
          fields: [
            { name: "key", kind: "string", description: "Section key." },
            { name: "name", kind: "string" },
            { name: "text", kind: "string", description: "Generated section content." },
          ],
        },
      },
    ],
  },
  {
    id: "documents.list",
    group: "Documents",
    method: "GET",
    path: "/interactions/{id}/documents",
    label: "List documents",
    description: "List documents for an interaction.",
    pathParams: [{ name: "id", in: "path", required: true, picker: interactionPicker }],
    body: { kind: "none" },
  },
  {
    id: "documents.get",
    group: "Documents",
    method: "GET",
    path: "/interactions/{id}/documents/{documentId}",
    label: "Get document",
    description: "Fetch a single generated document.",
    pathParams: [
      { name: "id", in: "path", required: true, picker: interactionPicker },
      { name: "documentId", in: "path", required: true, picker: documentPicker },
    ],
    body: { kind: "none" },
  },
  {
    id: "documents.update",
    group: "Documents",
    method: "PATCH",
    path: "/interactions/{id}/documents/{documentId}",
    label: "Update document",
    description: "Update editable fields on a document. Only fields you fill in are sent.",
    pathParams: [
      { name: "id", in: "path", required: true, picker: interactionPicker },
      { name: "documentId", in: "path", required: true, picker: documentPicker },
    ],
    body: {
      kind: "json",
      schema: [
        {
          name: "name",
          kind: "string",
          description: "New human-readable name for the document.",
          example: "Updated clinical note",
        },
      ],
    },
  },
  {
    id: "documents.delete",
    group: "Documents",
    method: "DELETE",
    path: "/interactions/{id}/documents/{documentId}",
    label: "Delete document",
    description: "Delete a generated document from an interaction.",
    pathParams: [
      { name: "id", in: "path", required: true, picker: interactionPicker },
      { name: "documentId", in: "path", required: true, picker: documentPicker },
    ],
    body: { kind: "none" },
  },
];
