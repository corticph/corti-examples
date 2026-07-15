import { LANGUAGE_CODES, LANGUAGE_LABELS } from "./languages";
import type { BodyField, EndpointDef, ParamPicker, ResponseField } from "./types";

// ---- Pickers --------------------------------------------------------------

// Sections live under /documents/sections — the new "guided" template/section system.
// Path params take sectionID + versionID UUIDs; the picker fills sectionID by listing
// sections (limited fields shown in the dropdown).
export const guidedSectionPicker: ParamPicker = {
  fromEndpoint: "guidedSections.list",
  valueField: ["id"],
  labelFields: ["name", "id"],
  createEndpoint: "guidedSections.create",
  createLabel: "Create section",
};

// Version picker — needs a sectionID first.
export const guidedSectionVersionPicker: ParamPicker = {
  fromEndpoint: "guidedSections.listVersions",
  valueField: ["id"],
  labelFields: ["versionNumber", "id"],
  parentParams: [
    {
      to: { in: "path", name: "sectionID" },
      from: { in: "path", name: "sectionID" },
      label: "section",
    },
  ],
};

// ---- Shared schema parts -------------------------------------------------

// Output schema is polymorphic (string | number | boolean | array | object) with
// recursive nesting. Modelling that fully in the BodyField schema would be a small
// research project; for v1 we expose it as a raw JSON editor with the docs link in
// the description so the user can paste a tree by hand.
const outputSchemaField: BodyField = {
  name: "outputSchema",
  kind: "json",
  required: true,
  rows: 14,
  description:
    'Polymorphic schema node (string | number | boolean | array | object). See the Create section docs for the full shape — examples include `{type:"string", description:"…"}` and `{type:"object", fields:[...]}`. Edit as raw JSON.',
  example: {
    type: "object",
    description: "Top-level object describing the section's structure.",
    fields: [
      {
        key: "summary",
        description: "Short narrative summary of the section.",
        value: { type: "string" },
      },
    ],
  },
};

const sectionGenerationField: BodyField = {
  name: "generation",
  kind: "object",
  required: true,
  fields: [
    {
      name: "heading",
      kind: "string",
      required: true,
      description: "Section heading. Passed to the LLM.",
      example: "Assessment",
    },
    {
      name: "instructions",
      kind: "object",
      required: true,
      fields: [
        {
          name: "contentPrompt",
          kind: "string",
          required: true,
          multiline: true,
          rows: 4,
          description:
            "What the model should include for synthesis. For `documentationMode: routed_parallel`, also drives fact routing into this section.",
        },
        {
          name: "writingStylePrompt",
          kind: "string",
          multiline: true,
          rows: 3,
          description: "Tone and style for the section output.",
        },
        {
          name: "miscPrompt",
          kind: "string",
          multiline: true,
          rows: 2,
          description: "Free-form prompt for anything that doesn't fit content/writing-style.",
        },
      ],
    },
    outputSchemaField,
  ],
};

// Labels are repeated {key, value} pairs used as query filters on LIST.
const labelsField: BodyField = {
  name: "labels",
  kind: "array",
  description: "Tag-style labels for filtering on LIST /sections.",
  item: {
    name: "label",
    kind: "object",
    fields: [
      { name: "key", kind: "string", required: true },
      { name: "value", kind: "string", required: true },
    ],
  },
};

const policyItemField: BodyField = {
  name: "policy",
  kind: "object",
  fields: [
    {
      name: "kind",
      kind: "enum",
      required: true,
      enum: ["project", "customers"],
      description:
        "`project` restricts to the owning project; `customers` grants access to listed tenants.",
    },
    {
      name: "customerIds",
      kind: "array",
      description: "Required when kind=customers. Tenant ids that should have access.",
      item: { name: "id", kind: "string" },
      showWhen: { field: "kind", equals: "customers" },
    },
  ],
};

// Response shapes — used by the upstream-outputs picker downstream.

const sectionResponseFields: ResponseField[] = [
  { name: "id", kind: "uuid", description: "Section id." },
  { name: "name", kind: "string" },
  { name: "description", kind: "string" },
  { name: "languages", kind: "array", item: { name: "lang", kind: "string" } },
  { name: "regions", kind: "array", item: { name: "region", kind: "string" } },
  { name: "specialties", kind: "array", item: { name: "specialty", kind: "string" } },
  {
    name: "labels",
    kind: "array",
    item: {
      name: "label",
      kind: "object",
      fields: [
        { name: "key", kind: "string" },
        { name: "value", kind: "string" },
      ],
    },
  },
  { name: "source", kind: "string", description: "`user` or `corti`." },
  { name: "createdAt", kind: "datetime" },
  { name: "updatedAt", kind: "datetime" },
];

const sectionVersionResponseFields: ResponseField[] = [
  { name: "id", kind: "uuid", description: "Version id." },
  { name: "versionNumber", kind: "number", description: "0-indexed, auto-incremented." },
  {
    name: "generation",
    kind: "json",
    description: "Section generation block (heading + instructions + outputSchema).",
  },
  { name: "publishedAt", kind: "datetime" },
  { name: "deletedAt", kind: "datetime" },
];

const policyResponseFields: ResponseField[] = [
  { name: "id", kind: "uuid" },
  { name: "kind", kind: "string", description: "project | customers" },
  { name: "sectionId", kind: "uuid" },
  { name: "createdBy", kind: "uuid" },
  { name: "createdAt", kind: "datetime" },
  { name: "updatedAt", kind: "datetime" },
  { name: "customerIds", kind: "array", item: { name: "id", kind: "string" } },
];

// ---- Endpoints ------------------------------------------------------------
// All paths use a TRAILING SLASH where the docs show one — Corti's router redirects
// no-slash → slash with 307, which can lose request bodies through the proxy.

export const guidedSections: EndpointDef[] = [
  // LIST -----------------------------------------------------------------
  {
    id: "guidedSections.list",
    group: "Guided Sections",
    method: "GET",
    path: "/documents/sections/",
    label: "List sections",
    description:
      "List guided sections. Filter by language, region, specialty, label, publish state, or source.",
    queryParams: [
      { name: "lang", in: "query", description: "BCP 47 tag (e.g. en, fr, en-GB). Repeatable." },
      {
        name: "region",
        in: "query",
        description: "ISO 3166-1 alpha-3 code (e.g. BEL). Repeatable.",
      },
      { name: "specialty", in: "query", description: "Clinical specialty. Repeatable." },
      { name: "label", in: "query", description: "key:value label filter. Repeatable." },
      { name: "published", in: "query", kind: "boolean" },
      { name: "source", in: "query", description: "user | corti" },
    ],
    body: { kind: "none" },
    responseSchema: [
      {
        name: "items",
        kind: "array",
        item: { name: "section", kind: "object", fields: sectionResponseFields },
      },
    ],
  },

  // GET / DELETE / UPDATE on a section ----------------------------------
  {
    id: "guidedSections.get",
    group: "Guided Sections",
    method: "GET",
    path: "/documents/sections/{sectionID}",
    label: "Get section",
    description: "Fetch a single section by id, including its published version.",
    pathParams: [{ name: "sectionID", in: "path", required: true, picker: guidedSectionPicker }],
    body: { kind: "none" },
    responseSchema: sectionResponseFields,
  },
  {
    id: "guidedSections.update",
    group: "Guided Sections",
    method: "PATCH",
    path: "/documents/sections/{sectionID}",
    label: "Update section metadata",
    description:
      "Update section metadata (name, description, languages, regions, specialties, labels). Only fields you fill in are sent.",
    pathParams: [{ name: "sectionID", in: "path", required: true, picker: guidedSectionPicker }],
    body: {
      kind: "json",
      schema: [
        { name: "name", kind: "string" },
        { name: "description", kind: "string", multiline: true, rows: 3 },
        {
          name: "languages",
          kind: "array",
          item: { name: "lang", kind: "enum", enum: LANGUAGE_CODES, enumLabels: LANGUAGE_LABELS },
        },
        {
          name: "regions",
          kind: "array",
          item: { name: "region", kind: "string", example: "BEL" },
        },
        { name: "specialties", kind: "array", item: { name: "specialty", kind: "string" } },
        labelsField,
      ],
    },
    responseSchema: sectionResponseFields,
  },
  {
    id: "guidedSections.delete",
    group: "Guided Sections",
    method: "DELETE",
    path: "/documents/sections/{sectionID}",
    label: "Delete section",
    description: "Soft-delete a section and all its versions.",
    pathParams: [{ name: "sectionID", in: "path", required: true, picker: guidedSectionPicker }],
    body: { kind: "none" },
  },

  // CREATE section -----------------------------------------------------
  {
    id: "guidedSections.create",
    group: "Guided Sections",
    method: "POST",
    path: "/documents/sections/",
    label: "Create section",
    description:
      "Create a new section with an initial version. When `publish` is true (default), the response includes the published version with inheritance resolved.",
    body: {
      kind: "json",
      schema: [
        {
          name: "name",
          kind: "string",
          required: true,
          description: "Human-readable name. Not passed to the LLM.",
        },
        { name: "description", kind: "string", multiline: true, rows: 2 },
        sectionGenerationField,
        {
          name: "languages",
          kind: "array",
          item: {
            name: "lang",
            kind: "enum",
            enum: LANGUAGE_CODES,
            enumLabels: LANGUAGE_LABELS,
            example: "en",
          },
        },
        {
          name: "regions",
          kind: "array",
          item: { name: "region", kind: "string", example: "BEL" },
        },
        { name: "specialties", kind: "array", item: { name: "specialty", kind: "string" } },
        labelsField,
        {
          name: "publish",
          kind: "boolean",
          description: "Defaults to true. Set false to keep the new section out of LIST /sections.",
        },
        {
          name: "policies",
          kind: "array",
          description: "Initial access policies (defaults to project-scoped).",
          item: policyItemField,
        },
      ],
    },
    responseSchema: sectionResponseFields,
  },

  // VERSIONS -----------------------------------------------------------
  {
    id: "guidedSections.listVersions",
    group: "Guided Sections",
    method: "GET",
    path: "/documents/sections/{sectionID}/versions/",
    label: "List section versions",
    description: "All versions of a section, oldest first. Use the version id with Get / Publish.",
    pathParams: [{ name: "sectionID", in: "path", required: true, picker: guidedSectionPicker }],
    body: { kind: "none" },
    responseSchema: [
      {
        name: "items",
        kind: "array",
        item: { name: "version", kind: "object", fields: sectionVersionResponseFields },
      },
    ],
  },
  {
    id: "guidedSections.getVersion",
    group: "Guided Sections",
    method: "GET",
    path: "/documents/sections/{sectionID}/versions/{versionID}",
    label: "Get section version",
    description: "Fetch a specific version (raw authored values, no inheritance resolution).",
    pathParams: [
      { name: "sectionID", in: "path", required: true, picker: guidedSectionPicker },
      { name: "versionID", in: "path", required: true, picker: guidedSectionVersionPicker },
    ],
    body: { kind: "none" },
    responseSchema: sectionVersionResponseFields,
  },
  {
    id: "guidedSections.createVersion",
    group: "Guided Sections",
    method: "POST",
    path: "/documents/sections/{sectionID}/versions/",
    label: "Create section version",
    description:
      "Create a new draft version of a section. When the section inherits from another, fields you omit are inherited from the parent's published version.",
    pathParams: [{ name: "sectionID", in: "path", required: true, picker: guidedSectionPicker }],
    body: {
      kind: "json",
      schema: [sectionGenerationField],
    },
    responseSchema: sectionVersionResponseFields,
  },
  {
    id: "guidedSections.deleteVersion",
    group: "Guided Sections",
    method: "DELETE",
    path: "/documents/sections/{sectionID}/versions/{versionID}",
    label: "Delete section version",
    description:
      "Soft-delete a section version. The latest published version becomes the active one if applicable.",
    pathParams: [
      { name: "sectionID", in: "path", required: true, picker: guidedSectionPicker },
      { name: "versionID", in: "path", required: true, picker: guidedSectionVersionPicker },
    ],
    body: { kind: "none" },
  },
  {
    id: "guidedSections.publishVersion",
    group: "Guided Sections",
    method: "POST",
    path: "/documents/sections/{sectionID}/versions/{versionID}/publish",
    label: "Publish section version",
    description:
      "Mark a version as the published one. Document generation uses this version going forward.",
    pathParams: [
      { name: "sectionID", in: "path", required: true, picker: guidedSectionPicker },
      { name: "versionID", in: "path", required: true, picker: guidedSectionVersionPicker },
    ],
    body: { kind: "none" },
    responseSchema: sectionVersionResponseFields,
  },

  // POLICIES -----------------------------------------------------------
  {
    id: "guidedSections.listPolicies",
    group: "Guided Sections",
    method: "GET",
    path: "/documents/sections/{sectionID}/policies/",
    label: "List section policies",
    description: "All access policies attached to a section.",
    pathParams: [{ name: "sectionID", in: "path", required: true, picker: guidedSectionPicker }],
    body: { kind: "none" },
    responseSchema: [
      {
        name: "items",
        kind: "array",
        item: { name: "policy", kind: "object", fields: policyResponseFields },
      },
    ],
  },
  {
    id: "guidedSections.createPolicies",
    group: "Guided Sections",
    method: "POST",
    path: "/documents/sections/{sectionID}/policies/",
    label: "Create section policies",
    description: "Attach access policies to a section.",
    pathParams: [{ name: "sectionID", in: "path", required: true, picker: guidedSectionPicker }],
    body: {
      kind: "json",
      schema: [
        {
          name: "items",
          kind: "array",
          required: true,
          description:
            "Policies to attach. Use kind=customers + customerIds to grant cross-tenant access.",
          item: policyItemField,
        },
      ],
    },
    responseSchema: [
      {
        name: "items",
        kind: "array",
        item: { name: "policy", kind: "object", fields: policyResponseFields },
      },
    ],
  },
];
