import type {
  BodyField,
  EndpointDef,
  MultiPickerConfig,
  ParamPicker,
  ResponseField,
} from "./types";

// ---- Shared response shapes -------------------------------------------------
// Pulled from the Agentic API docs (/agentic/agents/*). These power the
// "Available from upstream" picker so downstream nodes can pluck specific fields
// via {{agents_create_1.id}}, {{agents_messageSend_1.taskId}}, etc.

const expertResponse: ResponseField = {
  name: "expert",
  kind: "object",
  fields: [
    { name: "type", kind: "string", description: '"expert" or "reference".' },
    { name: "id", kind: "uuid", description: "The expert's unique id." },
    { name: "name", kind: "string" },
    { name: "description", kind: "string" },
    { name: "systemPrompt", kind: "string" },
    {
      name: "mcpServers",
      kind: "array",
      item: {
        name: "server",
        kind: "object",
        fields: [
          { name: "id", kind: "uuid" },
          { name: "name", kind: "string" },
          { name: "transportType", kind: "string", description: "stdio | streamable_http | sse." },
          {
            name: "authorizationType",
            kind: "string",
            description: "none | bearer | inherit | oauth2.0.",
          },
          { name: "url", kind: "string" },
        ],
      },
    },
  ],
};

// Shape returned by Create / Get / Update Agent.
const agentResponse: ResponseField[] = [
  { name: "id", kind: "uuid", description: "Unique identifier of the agent." },
  { name: "name", kind: "string" },
  { name: "description", kind: "string" },
  { name: "systemPrompt", kind: "string" },
  {
    name: "agentType",
    kind: "string",
    description: "expert | orchestrator | interviewing-expert.",
  },
  {
    name: "experts",
    kind: "array",
    description: "Experts configured on this agent.",
    item: expertResponse,
  },
];

// Part of a message (shared by send-message and task history shapes).
const messagePartResponse: ResponseField = {
  name: "part",
  kind: "object",
  fields: [
    { name: "kind", kind: "string", description: "text | file | data." },
    { name: "text", kind: "string", description: "Set when kind=text." },
    { name: "data", kind: "json", description: "Set when kind=data — arbitrary JSON payload." },
  ],
};

// Message shape (returned directly by send-message, also appears inside task status).
const messageResponse: ResponseField = {
  name: "message",
  kind: "object",
  fields: [
    { name: "messageId", kind: "uuid" },
    { name: "kind", kind: "string", description: 'Always "message".' },
    { name: "role", kind: "string", description: "user | agent." },
    { name: "taskId", kind: "uuid" },
    { name: "contextId", kind: "uuid" },
    { name: "parts", kind: "array", item: messagePartResponse },
  ],
};

// Task shape returned by send-message (when long-running) and get-task.
const taskResponse: ResponseField[] = [
  { name: "id", kind: "uuid", description: "Unique task id." },
  {
    name: "contextId",
    kind: "uuid",
    description: "Identifier of the context (thread) the task belongs to.",
  },
  { name: "kind", kind: "string", description: 'Always "task".' },
  {
    name: "status",
    kind: "object",
    fields: [
      {
        name: "state",
        kind: "string",
        description:
          "submitted | working | input-required | completed | canceled | failed | rejected | auth-required | unknown.",
      },
      { ...messageResponse, name: "message", description: "Latest status message from the agent." },
    ],
  },
  {
    name: "history",
    kind: "array",
    description: "Prior messages in the task, oldest first.",
    item: messageResponse,
  },
  {
    name: "artifacts",
    kind: "array",
    description: "Artifacts produced by the task (files, structured outputs, etc.).",
    item: {
      name: "artifact",
      kind: "object",
      fields: [
        { name: "artifactId", kind: "uuid" },
        { name: "name", kind: "string" },
        { name: "description", kind: "string" },
        { name: "parts", kind: "array", item: messagePartResponse },
      ],
    },
  },
];

// Registry of prebuilt experts available in the Corti Agentic Framework, scraped from
// the docs at /agentic/experts/overview. Each entry is the shape the MultiPicker UI
// shows in the dropdown (`name`, `registryKey`, `description`) — the picker's `toItem`
// wraps it into the wire-shape `{type:"reference", ...}` Corti expects when added to
// an agent's experts array.
//
// Update path: if Corti publishes a new expert, add a row here. Optionally the
// MultiPicker also fetches the live registry (`agents.experts` endpoint) and merges
// any keys not seen here, so user-registered custom experts still appear.
const REGISTRY_EXPERTS = [
  {
    name: "Memory",
    registryKey: "memory-expert",
    description:
      "Recall and analyze content from large in-request contexts and files. Core toolbox — keep available across most workflows.",
  },
  {
    name: "POSOS",
    registryKey: "posos-expert",
    description:
      "Medication guidance: dosing, interactions, contraindications, and prescribing considerations from POSOS.",
  },
  {
    name: "DrugBank",
    registryKey: "drugbank-expert",
    description:
      "Detailed drug information, medication profiles, and drug-drug interactions from DrugBank.",
  },
  {
    name: "PubMed",
    registryKey: "pubmed-expert",
    description:
      "Search PubMed for scientific articles, abstracts, and citations from biomedical literature.",
  },
  {
    name: "Clinical Trials",
    registryKey: "clinical-trials-expert",
    description:
      "Search clinical trials, study protocols, eligibility criteria, and recruitment status.",
  },
  {
    name: "Web Search",
    registryKey: "web-search-expert",
    description: "Search the web and retrieve up-to-date information from online sources.",
  },
  {
    name: "Medical Coding (General)",
    registryKey: "coding-expert",
    description: "AI-assisted diagnosis and procedure coding across all supported coding systems.",
  },
  {
    name: "Medical Coding (ICD-10-CM)",
    registryKey: "coding-expert-icd-10-cm",
    description: "ICD-10-CM diagnosis coding — US standard.",
  },
  {
    name: "Medical Coding (ICD-10 WHO)",
    registryKey: "coding-expert-icd-10-int",
    description: "ICD-10 WHO international diagnosis coding.",
  },
  {
    name: "Medical Coding (ICD-10-PCS)",
    registryKey: "coding-expert-icd-10-pcs",
    description: "ICD-10-PCS inpatient procedure coding — US standard.",
  },
  {
    name: "Medical Coding (ICD-10-UK)",
    registryKey: "coding-expert-icd-10-uk",
    description: "ICD-10-UK diagnosis coding — UK standard.",
  },
  {
    name: "Medical Calculator",
    registryKey: "medical-calculator-expert",
    description:
      "Clinical calculations such as BMI, HbA1c, glucose conversions, and other medical formulas.",
  },
  {
    name: "Interviewing",
    registryKey: "interviewing-expert",
    description:
      "Guide users through structured questionnaires and clinical interviews step by step.",
  },
] as const;

// Shared picker config — used on both create and update so the two stay in sync.
const expertsPicker: MultiPickerConfig = {
  // Pure-static for now. If/when /experts is confirmed to return a usable list, add
  // `fromEndpoint: "agents.experts"` and the picker will merge custom additions on top.
  staticOptions: REGISTRY_EXPERTS as unknown as any[],
  labelField: "name",
  subLabelField: "registryKey",
  // Wire shape per the create-agent docs: { type: "reference", name: "<registry-slug>" }.
  // The registry uses the slug (e.g. "memory-expert") as the canonical name — sending the
  // human-readable display label here causes a 400 "registry_expert_not_found". Display
  // labels are looked up from the registry server-side and filled in on the response.
  toItem: (opt: any) => ({
    type: "reference",
    name: opt?.registryKey ?? opt?.key ?? opt?.id ?? opt?.name ?? "",
  }),
  // Stable key across both option (uses registryKey) and item (uses name = slug). The
  // chip renderer uses this to re-resolve the option for a nicer display label even
  // though the stored item only carries the slug.
  itemKey: (x: any) => x?.registryKey ?? x?.name ?? x?.key ?? x?.id ?? "",
};

// Reusable picker config for any path/query param holding an agentId.
// Fetches from List Agents and offers a "Create agent" jump when none exist yet.
export const agentPicker: ParamPicker = {
  fromEndpoint: "agents.list",
  // Different Corti responses use different id field names; try both.
  valueField: ["id", "agentId"],
  labelFields: ["name", "description"],
  createEndpoint: "agents.create",
  createLabel: "Create agent",
};

// One part inside a message — discriminated by `kind`. Mirrors the A2A part shape
// (TextPart / DataPart / FilePart). Conditional fields keep the form clean per type.
const messagePartField: BodyField = {
  name: "part",
  kind: "object",
  fields: [
    {
      name: "kind",
      kind: "enum",
      required: true,
      enum: ["text", "data", "file"],
      example: "text",
      description: "Picks which part shape this is — the field below changes to match.",
    },
    {
      name: "text",
      kind: "string",
      multiline: true,
      rows: 4,
      showWhen: { field: "kind", equals: "text" },
      description: "Plain text content (TextPart). Direct user/agent message content.",
      example: "Hello there. This is my first message.",
    },
    {
      name: "data",
      kind: "json",
      rows: 8,
      showWhen: { field: "kind", equals: "data" },
      description:
        "Structured JSON (DataPart). Indexed into context memory and semantically retrievable. Useful for patient records, clinical facts, EHR identifiers, etc.",
      example: { patientId: "pat_12345", encounterDate: "2025-12-15" },
    },
    {
      name: "file",
      kind: "json",
      rows: 6,
      showWhen: { field: "kind", equals: "file" },
      description:
        "File reference (FilePart). Inline-base64 or URI form, plus name/mimeType. FilePart support is still partial — see docs.",
      example: { name: "discharge.pdf", mimeType: "application/pdf", uri: "https://..." },
    },
  ],
};

export const agents: EndpointDef[] = [
  {
    id: "agents.list",
    group: "Agents",
    unversioned: true,
    method: "GET",
    path: "/agents",
    label: "List agents",
    description: "List all agents available in the Corti Agent Framework for your tenant.",
    body: { kind: "none" },
    responseSchema: [
      {
        name: "items",
        kind: "array",
        description: "Agents available in this tenant.",
        item: {
          name: "agent",
          kind: "object",
          fields: agentResponse,
        },
      },
    ],
  },
  {
    id: "agents.create",
    group: "Agents",
    unversioned: true,
    method: "POST",
    path: "/agents",
    label: "Create agent",
    description:
      "Create a new agent that can be invoked via the messageSend endpoint. Add experts later or pass them here as a free-form JSON array (see Expert Registry for keys).",
    body: {
      kind: "json",
      schema: [
        {
          name: "name",
          kind: "string",
          required: true,
          example: "My First Agent",
        },
        {
          name: "description",
          kind: "string",
          multiline: true,
          rows: 3,
          example: "A simple agent to get started with the Corti Agentic Framework",
        },
        {
          name: "systemPrompt",
          kind: "string",
          multiline: true,
          rows: 4,
          description:
            "Orchestrator-level system prompt that steers reasoning and expert selection.",
        },
        {
          name: "experts",
          kind: "array",
          description:
            'Experts assigned to this agent. Pick from the registry below — each addition becomes a chip you can remove. For custom (type="new") experts, switch to the JSON tab and add them by hand.',
          item: {
            name: "expert",
            kind: "object",
            fields: [
              { name: "type", kind: "string", description: '"reference" for a registry expert.' },
              { name: "name", kind: "string", description: "Registry slug (e.g. memory-expert)." },
            ],
          },
          multiPicker: expertsPicker,
        },
      ],
    },
    responseSchema: agentResponse,
  },
  {
    id: "agents.get",
    group: "Agents",
    unversioned: true,
    method: "GET",
    path: "/agents/{id}",
    label: "Get agent",
    description: "Retrieve an agent by its id, including its capabilities and configured experts.",
    pathParams: [{ name: "id", in: "path", required: true, picker: agentPicker }],
    body: { kind: "none" },
    responseSchema: agentResponse,
  },
  {
    id: "agents.update",
    group: "Agents",
    unversioned: true,
    method: "PATCH",
    path: "/agents/{id}",
    label: "Update agent",
    description: "Update an existing agent. Only fields you fill in are sent.",
    pathParams: [{ name: "id", in: "path", required: true, picker: agentPicker }],
    body: {
      kind: "json",
      schema: [
        {
          name: "name",
          kind: "string",
          example: "Updated agent name",
        },
        {
          name: "description",
          kind: "string",
          multiline: true,
          rows: 3,
          example: "Updated description",
        },
        {
          name: "systemPrompt",
          kind: "string",
          multiline: true,
          rows: 4,
        },
        {
          name: "experts",
          kind: "array",
          description:
            'Replacement experts array (full set, not a delta). Pick from the registry to add chips — remove with the trash icon. For type="new" custom experts, switch to the JSON tab.',
          item: {
            name: "expert",
            kind: "object",
            fields: [
              { name: "type", kind: "string", description: '"reference" for a registry expert.' },
              { name: "name", kind: "string", description: "Registry slug (e.g. memory-expert)." },
            ],
          },
          multiPicker: expertsPicker,
        },
      ],
    },
    responseSchema: agentResponse,
  },
  {
    id: "agents.delete",
    group: "Agents",
    unversioned: true,
    method: "DELETE",
    path: "/agents/{id}",
    label: "Delete agent",
    description: "Delete an agent. Once deleted it can no longer be used in threads.",
    pathParams: [{ name: "id", in: "path", required: true, picker: agentPicker }],
    body: { kind: "none" },
  },
  {
    id: "agents.getCard",
    group: "Agents",
    unversioned: true,
    method: "GET",
    // A2A discovery endpoint — agent metadata in standardized JSON shape.
    path: "/agents/{id}/.well-known/agent-card",
    label: "Get agent card",
    description:
      "A2A agent card: identity, endpoint URL, capabilities, skills, and auth requirements in the A2A discovery format.",
    pathParams: [{ name: "id", in: "path", required: true, picker: agentPicker }],
    body: { kind: "none" },
    responseSchema: [
      {
        name: "protocolVersion",
        kind: "string",
        description: "A2A protocol version this agent supports.",
      },
      { name: "name", kind: "string" },
      { name: "description", kind: "string" },
      {
        name: "url",
        kind: "string",
        description: "Endpoint URL where the agent processes messages.",
      },
      { name: "version", kind: "string" },
      {
        name: "capabilities",
        kind: "object",
        fields: [
          { name: "streaming", kind: "boolean" },
          { name: "pushNotifications", kind: "boolean" },
          { name: "stateTransitionHistory", kind: "boolean" },
        ],
      },
      {
        name: "defaultInputModes",
        kind: "array",
        description: "MIME types this agent accepts on input by default.",
        item: { name: "mime", kind: "string" },
      },
      {
        name: "defaultOutputModes",
        kind: "array",
        description: "MIME types this agent emits on output by default.",
        item: { name: "mime", kind: "string" },
      },
      {
        name: "skills",
        kind: "array",
        item: {
          name: "skill",
          kind: "object",
          fields: [
            { name: "id", kind: "string" },
            { name: "name", kind: "string" },
            { name: "description", kind: "string" },
          ],
        },
      },
    ],
  },
  {
    id: "agents.messageSend",
    group: "Agents",
    unversioned: true,
    method: "POST",
    // The `:send` suffix is part of the path (custom verb), not a query param.
    path: "/agents/{id}/v1/message:send",
    label: "Send message",
    description:
      "Start or continue a task. Omit taskId/contextId to start fresh; pass them to continue an existing thread. The server returns either a Task (long-running) or a Message (immediate).",
    pathParams: [{ name: "id", in: "path", required: true, picker: agentPicker }],
    body: {
      kind: "json",
      schema: [
        {
          name: "message",
          kind: "object",
          required: true,
          description: "The message envelope (A2A Message shape).",
          fields: [
            {
              name: "kind",
              kind: "enum",
              required: true,
              enum: ["message"],
              example: "message",
              description: 'Always "message" for outgoing client messages.',
            },
            {
              name: "role",
              kind: "enum",
              required: true,
              enum: ["user", "agent"],
              example: "user",
              description: '"user" for outgoing client messages.',
            },
            {
              name: "messageId",
              kind: "uuid",
              required: true,
              description: "Client-generated unique id for this message (any UUID).",
              example: "00000000-0000-0000-0000-000000000000",
            },
            {
              name: "parts",
              kind: "array",
              required: true,
              description: "One or more Parts — text, data, and/or file references.",
              item: messagePartField,
            },
            {
              name: "taskId",
              kind: "uuid",
              description:
                "Pass when continuing an existing task (e.g. the previous response was state=input-required).",
            },
            {
              name: "contextId",
              kind: "uuid",
              description:
                "Pass to attach this message to an existing context (thread). Omit on the first message — the server assigns one.",
            },
          ],
        },
      ],
    },
    // The response wraps the A2A union under either `task` (long-running) or `message`
    // (immediate, returned synchronously). Reference downstream as e.g.
    // `{{agents_messageSend_1.task.id}}` or `{{agents_messageSend_1.message.parts.0.text}}`.
    responseSchema: [
      {
        name: "task",
        kind: "object",
        description:
          "Present when the agent kicked off a long-running task. Use task.id with Get Task for polling.",
        fields: taskResponse,
      },
      {
        name: "message",
        kind: "object",
        description:
          "Present when the agent responded immediately. Inspect message.parts[].text for the reply.",
        fields: [
          { name: "kind", kind: "string", description: 'Always "message".' },
          { name: "messageId", kind: "uuid" },
          { name: "role", kind: "string", description: "user | agent." },
          { name: "taskId", kind: "uuid" },
          { name: "contextId", kind: "uuid" },
          { name: "parts", kind: "array", item: messagePartResponse },
        ],
      },
    ],
  },
  {
    id: "agents.getTask",
    group: "Agents",
    unversioned: true,
    method: "GET",
    path: "/agents/{id}/tasks/{taskId}",
    label: "Get task",
    description:
      "Retrieve a task's status, history, and any artifacts. Use the taskId returned by messageSend.",
    pathParams: [
      { name: "id", in: "path", required: true, picker: agentPicker },
      { name: "taskId", in: "path", required: true },
    ],
    body: { kind: "none" },
    responseSchema: taskResponse,
  },
  {
    id: "agents.getContext",
    group: "Agents",
    unversioned: true,
    method: "GET",
    path: "/agents/{id}/contexts/{contextId}",
    label: "Get context",
    description:
      "Retrieve all tasks and top-level messages associated with a context (thread) for this agent.",
    pathParams: [
      { name: "id", in: "path", required: true, picker: agentPicker },
      { name: "contextId", in: "path", required: true },
    ],
    body: { kind: "none" },
    responseSchema: [
      { name: "id", kind: "uuid", description: "Context id." },
      {
        name: "items",
        kind: "array",
        description: "Tasks and messages in this context, in order.",
        item: {
          name: "task",
          kind: "object",
          fields: taskResponse,
        },
      },
    ],
  },
  {
    id: "agents.deleteContext",
    group: "Agents",
    unversioned: true,
    method: "DELETE",
    path: "/agents/{id}/contexts/{contextId}",
    label: "Delete context",
    description:
      "Delete a context (thread) and scrub all associated messages, memories, and memory chunks. Thread + task metadata is soft-deleted for audit; content is irreversibly overwritten.",
    pathParams: [
      { name: "id", in: "path", required: true, picker: agentPicker },
      { name: "contextId", in: "path", required: true },
    ],
    body: { kind: "none" },
  },
  {
    id: "agents.experts",
    group: "Agents",
    unversioned: true,
    method: "GET",
    // Docs don't publish the exact REST path for the registry; SDK exposes it as agents.getRegistryExperts().
    // /experts is the conventional guess — if you get a 404, check the JSON tab and adjust.
    path: "/experts",
    label: "List registry experts",
    description:
      "List experts available in the registry — capabilities, descriptions, and configuration requirements. Use the returned keys in the `experts` array when creating an agent.",
    body: { kind: "none" },
    responseSchema: [
      {
        name: "experts",
        kind: "array",
        description: "All experts available in the registry.",
        item: {
          name: "expert",
          kind: "object",
          fields: [
            { name: "name", kind: "string", description: "Registry key (e.g. memory-expert)." },
            { name: "description", kind: "string" },
            { name: "displayName", kind: "string", description: "Human-readable display label." },
            { name: "displayDescription", kind: "string" },
            {
              name: "mcpServers",
              kind: "array",
              item: {
                name: "server",
                kind: "object",
                fields: [
                  { name: "name", kind: "string" },
                  { name: "authorizationType", kind: "string" },
                ],
              },
            },
            {
              name: "configSchema",
              kind: "json",
              description: "Optional JSON Schema for this expert's config.",
            },
          ],
        },
      },
    ],
  },
];
