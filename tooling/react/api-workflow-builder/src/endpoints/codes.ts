import { interactionPicker } from "./interactions";
import type { EndpointDef, ParamPicker } from "./types";

// Body-mode picker: predict-codes has no interactionId in its path, so we read it from
// a sibling body field (`_interactionId`) that the form gates above the documentId picker.
const bodyDocumentPicker: ParamPicker = {
  fromEndpoint: "documents.list",
  valueField: ["documentId", "id"],
  labelFields: ["name", "templateKey", "status", "createdAt"],
  parentParams: [
    {
      to: { in: "path", name: "id" },
      from: { in: "body", name: "_interactionId" },
      label: "interaction",
    },
  ],
};

// Stable + beta coding systems from docs.corti.ai/coding/overview.
// `allowCustom` is on so users can type early-alpha systems (icd10ca, icd10nl, ...)
// without us baking every one into the dropdown.
const CODING_SYSTEMS = [
  "icd10cm-inpatient",
  "icd10cm-outpatient",
  "icd10pcs",
  "cpt",
  "hcpcs",
  "icd10",
  "icd11",
  "icd10gm",
  "ops",
  "icd10uk",
  "opcs4",
  "cim10fr",
  "ccam",
  "cie10es",
  "cie10pcs",
  "icd10am",
  "achi",
  "icd10ca",
  "icd10nl",
  "icd10no",
  "ncsp",
  "ncmp",
  "icd10se",
  "sks",
  "chop",
  "snomedct",
  "loinc",
];

const CODING_SYSTEM_LABELS: Record<string, string> = {
  "icd10cm-inpatient": "icd10cm-inpatient — US ICD-10-CM (inpatient)",
  "icd10cm-outpatient": "icd10cm-outpatient — US ICD-10-CM (outpatient)",
  icd10pcs: "icd10pcs — US ICD-10-PCS (inpatient procedures)",
  cpt: "cpt — US CPT (outpatient procedures)",
  hcpcs: "hcpcs — US HCPCS Level II",
  icd10: "icd10 — WHO international ICD-10",
  icd11: "icd11 — WHO international ICD-11",
  icd10gm: "icd10gm — Germany / Switzerland ICD-10-GM",
  ops: "ops — Germany OPS (procedures)",
  icd10uk: "icd10uk — UK NHS ICD-10",
  opcs4: "opcs4 — UK OPCS-4 (procedures)",
  cim10fr: "cim10fr — France CIM-10-FR",
  ccam: "ccam — France CCAM (procedures)",
  cie10es: "cie10es — Spain CIE-10-ES",
  cie10pcs: "cie10pcs — Spain CIE-10-PCS (procedures)",
  icd10am: "icd10am — Australia ICD-10-AM",
  achi: "achi — Australia ACHI (procedures)",
  icd10ca: "icd10ca — Canada ICD-10-CA",
  icd10nl: "icd10nl — Netherlands ICD-10-NL",
  icd10no: "icd10no — Norway ICD-10-NO",
  ncsp: "ncsp — Norway NCSP (surgical procedures)",
  ncmp: "ncmp — Norway NCMP (medical procedures)",
  icd10se: "icd10se — Sweden ICD-10-SE",
  sks: "sks — Denmark SKS",
  chop: "chop — Switzerland CHOP (procedures)",
  snomedct: "snomedct — SNOMED CT (international)",
  loinc: "loinc — LOINC (international)",
};

export const codes: EndpointDef[] = [
  {
    id: "codes.predict",
    group: "Coding",
    method: "POST",
    // Trailing slash matters — POST /v2/tools/coding/ per docs.corti.ai/coding/how-it-works.
    path: "/tools/coding/",
    label: "Predict codes",
    description:
      "Stateless medical-coding prediction. Send clinical text (or a Corti documentId) plus a coding system; get back predicted codes, candidates, and evidences.",
    // The API expects `system` as an array of up to 4 entries. We expose a single dropdown
    // in the form and wrap the picked value into a one-element array on send.
    preSendTransform: (body: unknown): unknown => {
      if (!body || typeof body !== "object") return body;
      const obj = body as Record<string, unknown>;
      if (typeof obj.system === "string" && obj.system) {
        return { ...obj, system: [obj.system] };
      }
      return obj;
    },
    body: {
      kind: "json",
      schema: [
        {
          name: "system",
          kind: "enum",
          required: true,
          enum: CODING_SYSTEMS,
          enumLabels: CODING_SYSTEM_LABELS,
          allowCustom: true,
          description:
            "Coding system to predict against. Pair by encounter type — icd10cm-outpatient + cpt for office visits, icd10cm-inpatient + icd10pcs for admissions. Use Manual for early-alpha systems not in the list.",
          example: "icd10cm-outpatient",
        },
        {
          name: "context",
          kind: "array",
          required: true,
          description:
            "Clinical input to code. Each item is either raw text or a reference to a document already stored in Corti.",
          item: {
            name: "contextItem",
            kind: "object",
            fields: [
              {
                name: "type",
                kind: "enum",
                required: true,
                example: "text",
                enum: ["text", "documentId"],
                description:
                  "Pick what kind of context this item is — the field below changes to match.",
              },
              {
                name: "text",
                kind: "string",
                multiline: true,
                rows: 6,
                showWhen: { field: "type", equals: "text" },
                description: "Paste the clinical note here.",
                example:
                  "58-year-old male presents for routine diabetes management. HbA1c 7.2%. Bilateral knee pain consistent with osteoarthritis.",
              },
              {
                name: "_interactionId",
                kind: "uuid",
                label: "Interaction",
                wireOmit: true,
                showWhen: { field: "type", equals: "documentId" },
                picker: interactionPicker,
                description:
                  "Helper — pick the interaction that owns the document. Not sent on the wire.",
              },
              {
                name: "documentId",
                kind: "uuid",
                showWhen: { field: "type", equals: "documentId" },
                picker: bodyDocumentPicker,
                description:
                  "Documents listed for the chosen interaction. The picked id is what hits the wire.",
              },
            ],
          },
        },
        {
          name: "filter",
          kind: "object",
          description:
            "Optional. Restrict predictions to specific codes or categories. Processing is include → exclude → result.",
          fields: [
            {
              name: "include",
              kind: "array",
              description: "Codes or categories the model may predict. Empty = all codes eligible.",
              item: { name: "code", kind: "string", example: "J18" },
            },
            {
              name: "exclude",
              kind: "array",
              description:
                "Codes or categories subtracted from the include set. Empty = nothing excluded.",
              item: { name: "code", kind: "string", example: "J189" },
            },
            {
              name: "expand",
              kind: "boolean",
              description:
                "When true (default), category codes are expanded to their assignable leaf codes.",
            },
          ],
        },
      ],
    },
  },
];
