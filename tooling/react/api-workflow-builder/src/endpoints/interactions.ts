import type { BodyField, EndpointDef, ParamPicker } from "./types";

// Reusable picker config for any path/query param that holds an interactionId.
// Fetches from List Interactions and offers a "Create interaction" jump when none exist.
export const interactionPicker: ParamPicker = {
  fromEndpoint: "interactions.list",
  // List Interactions returns each item with `id`; Create Interaction returns `interactionId`.
  // Try both so the picker works regardless of which shape Corti returns.
  valueField: ["id", "interactionId"],
  createEndpoint: "interactions.create",
  createLabel: "Create interaction",
  // Visible label: encounter title + patient name (whatever is set).
  // Falls back to the encounter.identifier or a short UUID when neither is available.
  displayLabel: (it) => {
    const title = it?.encounter?.title;
    const name = it?.patient?.name;
    const parts = [title, name].filter(Boolean);
    if (parts.length) return parts.join(" — ");
    return it?.encounter?.identifier || it?.id || it?.interactionId || "(unnamed)";
  },
  // Hover tooltip: external identifier and the underlying interaction UUID.
  displayTitle: (it) => {
    const lines: string[] = [];
    const ext = it?.encounter?.identifier;
    const uuid = it?.id ?? it?.interactionId;
    if (ext) lines.push(`identifier: ${ext}`);
    if (uuid) lines.push(`id: ${uuid}`);
    return lines.join("\n");
  },
};

// Shared object schemas — re-used between create + update.
const encounterField: BodyField = {
  name: "encounter",
  kind: "object",
  description: "Encounter metadata.",
  fields: [
    {
      name: "identifier",
      kind: "string",
      description: "Your unique encounter tracker.",
      example: "encounter-123",
    },
    {
      name: "status",
      kind: "enum",
      example: "planned",
      enum: ["planned", "in-progress", "on-hold", "completed", "cancelled", "deleted"],
    },
    {
      name: "type",
      kind: "enum",
      example: "first_consultation",
      enum: ["first_consultation", "consultation", "emergency", "inpatient", "outpatient"],
    },
    {
      name: "title",
      kind: "string",
      description: "Human-readable name for the interaction.",
      example: "Follow-up visit",
    },
    {
      name: "period",
      kind: "object",
      description: "Encounter time window. Both timestamps are UTC (ISO-8601).",
      fields: [
        { name: "startedAt", kind: "datetime", example: "2026-05-13T08:00:00Z" },
        { name: "endedAt", kind: "datetime", example: "2026-05-13T09:00:00Z" },
      ],
    },
  ],
};

// Create-time variant: per the OpenAPI spec (InteractionsEncounterCreateRequest), the API
// requires `encounter.identifier`, `encounter.status`, AND `encounter.type` — not `period`.
// Missing any of the three currently surfaces as a 500 "unexpected error" from Corti rather
// than a 400, which is why the form needs to flag them up front.
const encounterFieldForCreate: BodyField = {
  ...encounterField,
  fields: (encounterField.fields ?? []).map((f) => {
    if (f.name === "identifier" || f.name === "status" || f.name === "type") {
      return { ...f, required: true };
    }
    return f;
  }),
};

const patientField: BodyField = {
  name: "patient",
  kind: "object",
  description: "Patient information. `identifier` is required if you include this block.",
  fields: [
    {
      name: "identifier",
      kind: "string",
      required: true,
      description: "FHIR patient reference.",
      example: "patient-001",
    },
    { name: "name", kind: "string", example: "Jane Doe" },
    {
      name: "gender",
      kind: "enum",
      example: "unknown",
      enum: ["male", "female", "unknown", "other"],
    },
    { name: "birthDate", kind: "datetime", example: "1990-01-01T00:00:00Z" },
    { name: "pronouns", kind: "string", example: "she/her" },
  ],
};

const assignedUserIdField: BodyField = {
  name: "assignedUserId",
  kind: "uuid",
  description: "The medical professional assigned to this interaction. Omit to auto-assign.",
  example: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
};

export const interactions: EndpointDef[] = [
  {
    id: "interactions.list",
    group: "Interactions",
    method: "GET",
    path: "/interactions",
    label: "List interactions",
    description: "Filter and paginate over interactions.",
    queryParams: [
      { name: "limit", in: "query", kind: "number", example: "10" },
      { name: "offset", in: "query", kind: "number" },
      { name: "encounterStatus", in: "query" },
      { name: "patientId", in: "query" },
    ],
    body: { kind: "none" },
  },
  {
    id: "interactions.create",
    group: "Interactions",
    method: "POST",
    path: "/interactions",
    label: "Create interaction",
    description: "Create a new interaction. Returns `interactionId` and `websocketUrl`.",
    body: {
      kind: "json",
      schema: [encounterFieldForCreate, patientField, assignedUserIdField],
    },
    responseSchema: [
      {
        name: "interactionId",
        kind: "uuid",
        description:
          "Unique identifier for the new interaction. Use in any /interactions/{id}/... call.",
      },
      {
        name: "websocketUrl",
        kind: "string",
        description: "WebSocket URL for /streams. Append `?token=Bearer ...` to use.",
      },
    ],
  },
  {
    id: "interactions.get",
    group: "Interactions",
    method: "GET",
    path: "/interactions/{id}",
    label: "Get interaction",
    description: "Retrieve a single interaction by ID.",
    pathParams: [{ name: "id", in: "path", required: true, picker: interactionPicker }],
    body: { kind: "none" },
  },
  {
    id: "interactions.update",
    group: "Interactions",
    method: "PATCH",
    path: "/interactions/{id}",
    label: "Update interaction",
    description:
      "Patch encounter metadata, patient info, or the assigned user. All top-level fields are optional — only the ones you fill in get sent.",
    pathParams: [{ name: "id", in: "path", required: true, picker: interactionPicker }],
    body: {
      kind: "json",
      schema: [encounterField, patientField, assignedUserIdField],
    },
  },
  {
    id: "interactions.delete",
    group: "Interactions",
    method: "DELETE",
    path: "/interactions/{id}",
    label: "Delete interaction",
    description: "Delete an interaction.",
    pathParams: [{ name: "id", in: "path", required: true, picker: interactionPicker }],
    body: { kind: "none" },
  },
];
