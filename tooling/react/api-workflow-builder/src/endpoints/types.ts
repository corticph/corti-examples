// Metadata-driven definition of every Corti endpoint we expose in the catalog.
// The RequestRunner component renders forms from this shape, and the workflow
// executor uses it to dispatch calls.

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | "WSS";

export type ParamKind = "string" | "number" | "boolean";

export type ParamPicker = {
  /** Endpoint id to fetch options from, e.g. "interactions.list". */
  fromEndpoint: string;
  /**
   * Field path(s) on each result item to use as the value.
   * Multiple paths are tried in order — first non-empty wins.
   * Corti's API is inconsistent: List Interactions returns `id`, Create Interaction returns `interactionId`.
   */
  valueField: string | string[];
  /** Optional dotted paths displayed next to the value, e.g. ["encounter.identifier", "encounter.status"]. */
  labelFields?: string[];
  /**
   * When set, fully replaces the default option label. Receives the raw list item.
   * Use for richer display logic than dotted-path joins (e.g. "title — patient name").
   */
  displayLabel?: (item: any) => string;
  /**
   * When set, used as the `title` attribute on each option (browser hover tooltip).
   * Use for secondary detail like the underlying id / identifier.
   */
  displayTitle?: (item: any) => string;
  /** Endpoint id to navigate to when there are no options yet, e.g. "interactions.create". */
  createEndpoint?: string;
  /** Button label for the empty-state nav. */
  createLabel?: string;
  /**
   * Parent params the source endpoint needs filled in (e.g. `recordings.list` requires an interactionId).
   * Each entry maps a field on the SOURCE endpoint to a field on the CURRENT form.
   * When any parent is missing, the picker shows a "pick parent first" state.
   */
  parentParams?: Array<{
    /** Where to put the value on the source endpoint. */
    to: { in: "path" | "query"; name: string };
    /**
     * Where to read the value from on the current form.
     * - "path" | "query": read from the surrounding request's path/query params.
     * - "body": read a sibling field on the immediate body object the picker lives in
     *           (used for cascading body-level pickers, e.g. doc-picker depends on interaction-picker).
     */
    from: { in: "path" | "query" | "body"; name: string };
    /** Human label for the "pick this first" message. */
    label?: string;
  }>;
  /**
   * When set, after the user picks a value, automatically fetch this endpoint
   * (with the picked value substituted into `valueParam`) and call onChange with
   * the fetched body instead of the picked id. Useful for "pick a transcript and
   * paste its content into this field".
   */
  fetchOnSelect?: {
    endpoint: string;
    /** Path-param name on the fetch endpoint that receives the picked value. */
    valueParam: string;
    /** Dotted path to extract from the response body. Defaults to the whole body. */
    extract?: string;
    /** Stringify the result as JSON before calling onChange. */
    asJson?: boolean;
    /**
     * When true AND the extracted value is an array, REPLACE the parent array
     * (the one this picker's host item lives in) with one element per array entry,
     * wrapped with `itemTemplate`. The placeholder string "$value" inside the
     * template is substituted with each entry.
     */
    spreadIntoParentArray?: boolean;
    /** Wrapping template applied to each spread element. */
    itemTemplate?: unknown;
    /** Optional post-processing function applied to the (extracted) response before onChange. */
    transform?: (value: unknown) => unknown;
  };
};

/**
 * Multi-select picker for array-typed fields. Fetches options from another endpoint
 * (e.g. `agents.experts` returns the registry list) and renders a dropdown to add
 * + chips for current items with remove buttons. Replaces the default array editor
 * when set on a `kind: "array"` BodyField.
 */
export type MultiPickerConfig = {
  /**
   * Endpoint id to fetch the option list from. Response shape autodetected. Optional
   * — when omitted, the picker uses only `staticOptions`. When both are set, the two
   * are merged (deduped by `itemKey`) so users see the docs list immediately and the
   * live registry's additions/customisations once the fetch completes.
   */
  fromEndpoint?: string;
  /**
   * Hardcoded option list used as the primary source. Useful when the registry
   * endpoint is unreliable or doesn't exist yet, when you want guaranteed offline
   * availability, or when the docs are the source of truth.
   */
  staticOptions?: any[];
  /**
   * Parent params the source endpoint needs filled in (e.g. agents.experts needs
   * no parents, but more specific list endpoints might depend on a path id).
   */
  parentParams?: ParamPicker["parentParams"];
  /** Dotted path on each option used as the chip's primary label. Default: "name". */
  labelField?: string;
  /** Dotted path used as the chip's secondary label / hint. Default: "registryKey". */
  subLabelField?: string;
  /**
   * Map a picked option to the wire-shape value stored in the array. Default is
   * identity (option itself). Use this when the option shape differs from the array
   * item shape — e.g. experts wrap registry options as `{type:"reference", ...}`.
   */
  toItem?: (option: any) => unknown;
  /**
   * Stable key for an option OR an array item; used to detect "already added" and
   * to identify items in remove operations. Default: the labelField value.
   */
  itemKey?: (option: any) => string;
};

export type ParamSpec = {
  name: string;
  in: "path" | "query" | "header";
  kind?: ParamKind;
  required?: boolean;
  description?: string;
  example?: string;
  placeholder?: string;
  /** When set, the runner renders a picker that fetches options from another endpoint. */
  picker?: ParamPicker;
};

export type MultipartField = {
  name: string;
  kind: "file" | "text";
  required?: boolean;
  description?: string;
  accept?: string; // for files, e.g. "audio/*"
};

export type BodyFieldKind =
  | "string"
  | "number"
  | "boolean"
  | "uuid"
  | "datetime"
  | "enum"
  | "object"
  | "array"
  /** Free-form JSON value (object/array/string/etc.) rendered as a textarea showing pretty JSON. */
  | "json";

export type BodyField = {
  name: string;
  kind: BodyFieldKind;
  label?: string;
  description?: string;
  /** Used as the placeholder text on string-ish inputs, default for enum dropdown, etc. */
  example?: unknown;
  required?: boolean;
  /** Only for kind === "enum" */
  enum?: string[];
  /** Optional display labels for enum values (e.g. "🇺🇸 English (en)"). */
  enumLabels?: Record<string, string>;
  /** When true on an enum field, a "Manual" toggle lets the user type a custom value. */
  allowCustom?: boolean;
  /** Only for kind === "object" */
  fields?: BodyField[];
  /** Only for kind === "array" — describes a single element */
  item?: BodyField;
  /** For kind === "string" — render as a textarea */
  multiline?: boolean;
  /** A field rendered as a textarea benefits from a row count */
  rows?: number;
  /** When set on a primitive field (uuid/string), render a picker fetched from another endpoint. */
  picker?: ParamPicker;
  /**
   * When set on an array field, replace the default array editor with a multi-select
   * picker that fetches options from another endpoint and renders selected items as
   * chips with remove buttons. Mirrors the console's expert-picker UX.
   */
  multiPicker?: MultiPickerConfig;
  /**
   * How to render the picker:
   *   "replace" (default) — picker replaces the primitive input entirely.
   *   "helper"            — picker is rendered above the primitive input as an "import" shortcut; both visible.
   */
  pickerMode?: "replace" | "helper";
  /**
   * Conditional rendering: only show this field when a sibling field equals one of the given values.
   * The field is also dropped from the wire payload when the condition isn't met.
   */
  showWhen?: { field: string; equals: string | string[] };
  /**
   * Helper field — render it in the form, but strip it from the request body before sending.
   * Useful for fields that only exist to drive other pickers (e.g. an "Interaction" selector
   * needed to scope a document picker that's the actual wire value).
   */
  wireOmit?: boolean;
};

/**
 * Subset of BodyField used to describe the SHAPE of an endpoint's response, so the workflow
 * editor can show which fields are available for `{{ref.field}}` substitution downstream.
 * Kept minimal on purpose — we only need enough to render a label, a kind chip, and let the
 * user drill into nested objects/arrays.
 */
export type ResponseField = {
  name: string;
  kind: BodyFieldKind;
  description?: string;
  /** For kind === "object" — nested fields. */
  fields?: ResponseField[];
  /** For kind === "array" — shape of a single element. */
  item?: ResponseField;
};

export type EndpointBody =
  | {
      kind: "json";
      example?: unknown; // raw default for the JSON editor (kept for backward compat)
      description?: string;
      /** When present, renders a form-driven UI. JSON editor remains as a sub-tab. */
      schema?: BodyField[];
    }
  | {
      kind: "multipart";
      fields: MultipartField[];
    }
  | {
      /** Raw binary upload — sent as application/octet-stream. */
      kind: "binary";
      description?: string;
      /** File input `accept` attribute, e.g. "audio/*". */
      accept?: string;
    }
  | { kind: "none" };

export type EndpointDef = {
  id: string; // dotted id, e.g. "interactions.create"
  group: string; // "Interactions" | "Recordings" | …
  method: HttpMethod;
  path: string; // "/interactions/{id}/recordings"
  label: string;
  description: string;
  docs?: string; // optional URL into corti docs
  pathParams?: ParamSpec[];
  queryParams?: ParamSpec[];
  headers?: ParamSpec[];
  body?: EndpointBody;
  /**
   * Optional transform applied to the (parsed, pruned) JSON body right before fetch.
   * Used to reshape the user's friendly form representation into the wire shape Corti
   * expects (e.g. expand a single transcript context item into one item per segment).
   * The form state stays untouched — this only changes what hits the network.
   */
  preSendTransform?: (body: unknown) => unknown;
  /**
   * When true, this endpoint is called WITHOUT the `/v2` version prefix.
   * Standard REST endpoints live under api.{region}.corti.app/v2/...; the agentic
   * surface may be mounted at api.{region}.corti.app/... directly.
   */
  unversioned?: boolean;
  /**
   * Shape of the (successful) response body. Used ONLY by the workflow editor to populate
   * the "Available from upstream" picker so users can wire `{{ref.field}}` references
   * without running the workflow first. Optional — endpoints without this still execute,
   * the picker just shows "(response shape not documented)" for them.
   */
  responseSchema?: ResponseField[];
};

export type FormValues = {
  path: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  // For JSON bodies, this holds the raw editor text so the user can keep it
  // half-valid while editing. For multipart bodies, keys are field names; file
  // values are File objects in component state (kept out of persistence).
  body: string | Record<string, string>;
};

export function emptyValuesFor(def: EndpointDef): FormValues {
  const path: Record<string, string> = {};
  for (const p of def.pathParams ?? []) path[p.name] = p.example ?? "";
  const query: Record<string, string> = {};
  for (const p of def.queryParams ?? []) query[p.name] = p.example ?? "";
  const headers: Record<string, string> = {};
  for (const p of def.headers ?? []) headers[p.name] = p.example ?? "";

  let body: FormValues["body"];
  if (!def.body || def.body.kind === "none") {
    body = "";
  } else if (def.body.kind === "json") {
    // When a schema is present, start empty — per-field examples become placeholders in the form.
    // Without a schema, prefill the JSON editor with the example so users still have a starting point.
    if (def.body.schema && def.body.schema.length > 0) {
      body = "";
    } else {
      body = def.body.example !== undefined ? JSON.stringify(def.body.example, null, 2) : "";
    }
  } else if (def.body.kind === "multipart") {
    body = {};
    for (const f of def.body.fields) if (f.kind === "text") body[f.name] = "";
  } else {
    // binary — no JSON state; the file lives in component state
    body = "";
  }
  return { path, query, headers, body };
}
