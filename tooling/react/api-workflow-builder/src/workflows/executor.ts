import { pruneEmpty, stripBySchema } from "../components/BodyForm";
import { endpointById } from "../endpoints/registry";
import type { BodyField, EndpointDef, FormValues } from "../endpoints/types";
import { type ExecutionError, executeRequest } from "../lib/requestExecutor";
import type { Profile } from "../profiles/types";
import type { NodeErrorDetail, NodeResult, Workflow, WorkflowNode, WorkflowRun } from "./types";

// Squeeze every diagnostic the runtime gives us out of a thrown error so the UI can
// show a copy-paste-ready blob. Cheap, allocates a few strings, runs once per failure.
function buildErrorDetail(e: any): NodeErrorDetail {
  const exec = e as Partial<ExecutionError>;
  const causeChain: string[] = [];
  let cur: unknown = exec.cause;
  let depth = 0;
  while (cur && depth < 4) {
    if (cur instanceof Error) {
      causeChain.push(`${cur.name}: ${cur.message}`);
      cur = (cur as any).cause;
    } else {
      causeChain.push(String(cur));
      break;
    }
    depth += 1;
  }
  return {
    timestamp: new Date().toISOString(),
    name: e?.name ?? "Error",
    message: e?.message ?? String(e),
    kind: exec.kind,
    causeText: causeChain.length ? causeChain.join("\n  ← ") : undefined,
    stack: typeof e?.stack === "string" ? e.stack : undefined,
    preview: exec.preview,
  };
}

// ---- Template substitution -----------------------------------------------------------
// Syntax: `{{nodeId.path.to.field}}` looks up the value from a previous node's response.
// Example: `{{create_interaction.interactionId}}` or `{{upload.recordingId}}`.

function getPath(obj: unknown, parts: string[]): unknown {
  let cur: any = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(part)) {
      cur = cur[Number(part)];
    } else {
      cur = cur[part];
    }
  }
  return cur;
}

const TEMPLATE_RE = /\{\{\s*([\w$][\w$.-]*)\s*\}\}/g;
// Matches a template that's the ENTIRE content of a JSON string value — i.e. wrapped in
// double quotes with nothing else. Lets us replace `"{{ref}}"` with a non-string JSON
// value (array / object / number / null) when ref resolves to one, instead of producing
// invalid JSON via the plain substituteTemplate path.
const STRINGED_TEMPLATE_RE = /"\{\{\s*([\w$][\w$.-]*)\s*\}\}"/g;

// Built-in template refs that resolve to a freshly generated value at substitution time.
// `$`-prefixed so they can't collide with a workflow node ref (refs are lowercase
// underscore slugs, generated from endpoint ids). Each occurrence is independent — two
// `{{$uuid}}`s in the same body produce two different UUIDs.
const BUILTIN_TEMPLATES: Record<string, () => string> = {
  // Fresh UUID v4 each call. The common case: unique identifiers like
  // `encounter.identifier` that Corti tombstones (so re-using fails with 409). Write
  // `"identifier": "run-{{$uuid}}"` once and every run gets a different identifier.
  uuid: () => {
    try {
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    } catch {
      /* fall through */
    }
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  },
  // ISO 8601 timestamp at substitution time. Useful for `period.startedAt` etc.
  timestamp: () => new Date().toISOString(),
  // Unix epoch milliseconds as a string. Useful when you want a short, sortable id.
  epoch: () => String(Date.now()),
};

export function substituteTemplate(text: string, context: Record<string, unknown>): string {
  return text.replace(TEMPLATE_RE, (_match, ref: string) => {
    // Built-in refs (`$uuid`, `$timestamp`, `$epoch`) resolve to a fresh generated value.
    if (ref.startsWith("$")) {
      const handler = BUILTIN_TEMPLATES[ref.slice(1)];
      if (handler) return handler();
      return _match; // unknown built-in — leave as-is so the user sees the typo
    }
    const [nodeId, ...rest] = ref.split(".");
    const source = context[nodeId];
    if (source === undefined) return _match; // leave as-is so the user can see it failed
    const value = rest.length ? getPath(source, rest) : source;
    if (value === undefined || value === null) return "";
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

/**
 * JSON-aware template substitution for the body of a json-bodied endpoint. Two passes:
 *
 *   Pass 1 — `"{{ref}}"` (template alone inside JSON string quotes): replace the whole
 *     `"…"` match with the JSON.stringify'd value. If ref resolves to an array or object,
 *     this lands it as a real JSON value (`[{...}]`) instead of a stringified blob with
 *     embedded escapes. Strings still serialise back to `"text"` and slot in normally.
 *
 *   Pass 2 — `{{ref}}` inside larger string content (e.g. `"prefix-{{x.id}}-suffix"`):
 *     fall back to plain text interpolation, same as substituteTemplate.
 *
 * Without pass 1, `"data": "{{x.facts}}"` would produce broken JSON (embedded quotes from
 * the stringified array would close the outer string early). With it, that template means
 * exactly what the user expects: drop the array in here.
 */
export function substituteJsonBody(text: string, context: Record<string, unknown>): string {
  const afterPass1 = text.replace(STRINGED_TEMPLATE_RE, (match, ref: string) => {
    const [nodeId, ...rest] = ref.split(".");
    const source = context[nodeId];
    if (source === undefined) return match; // leave the literal so the user sees it failed
    const value = rest.length ? getPath(source, rest) : source;
    if (value === undefined) return match;
    if (value === null) return "null";
    return JSON.stringify(value);
  });
  return substituteTemplate(afterPass1, context);
}

/**
 * Apply the same body-shaping pipeline RequestRunner uses before sending: parse the
 * JSON body string, prune empty fields, strip schema-flagged helpers (wireOmit /
 * unmet showWhen), and run the endpoint's preSendTransform (e.g. documents.create
 * spreads a single transcript context item into one item per segment for the wire).
 *
 * Workflows need this because the executor's substituted body is "what the form
 * representation looks like with templates resolved" — not the wire shape Corti
 * actually expects. Skipping this is what produced the 400 about CommonTranscript
 * receiving an array.
 *
 * Non-JSON bodies (multipart, binary, none) are returned unchanged.
 */
function shapeBodyForSend(endpoint: EndpointDef, values: FormValues): FormValues {
  if (endpoint.body?.kind !== "json") return values;
  const schema: BodyField[] | undefined = endpoint.body.schema;
  if (!schema || schema.length === 0) {
    // No schema — still run preSendTransform if defined, but skip prune/strip which
    // depend on schema metadata.
    if (!endpoint.preSendTransform || typeof values.body !== "string" || !values.body.trim()) {
      return values;
    }
    try {
      const parsed = JSON.parse(values.body);
      const shaped = endpoint.preSendTransform(parsed);
      return { ...values, body: JSON.stringify(shaped) };
    } catch {
      return values;
    }
  }
  if (typeof values.body !== "string" || !values.body.trim()) return values;
  try {
    const parsed = JSON.parse(values.body);
    let shaped: unknown = pruneEmpty(parsed) ?? {};
    shaped = stripBySchema(schema, shaped);
    if (endpoint.preSendTransform) {
      shaped = endpoint.preSendTransform(shaped);
    }
    return { ...values, body: JSON.stringify(shaped) };
  } catch {
    // Leave the body alone if it doesn't parse — the executor will surface a clearer
    // error once the server complains. Better than swallowing it here.
    return values;
  }
}

/**
 * Overwrite every path listed in `node.autoGenerateFields` with a freshly generated
 * UUID. Runs after substituteValues so the auto-gen takes precedence over both saved
 * values and template references. Paths follow the same shape as `runtimeFields`:
 *
 *   "path.id"             → values.path.id = uuid
 *   "query.foo"           → values.query.foo = uuid
 *   "headers.X-Foo"       → values.headers["X-Foo"] = uuid
 *   "body.foo"            → multipart: values.body.foo = uuid
 *                         → json: parsed body's foo = uuid (re-stringified)
 *   "body.encounter.id"   → nested JSON path: parsed.encounter.id = uuid
 *
 * Each path gets its own UUID — two auto-uuid fields produce two distinct values.
 */
function applyAutoGenerate(node: WorkflowNode, values: FormValues): FormValues {
  const paths = node.autoGenerateFields ?? [];
  if (paths.length === 0) return values;

  const nextPath = { ...values.path };
  const nextQuery = { ...values.query };
  const nextHeaders = { ...values.headers };
  let nextBody: FormValues["body"] = values.body;
  let bodyJson: Record<string, unknown> | null = null;

  const fresh = () => BUILTIN_TEMPLATES.uuid();

  for (const p of paths) {
    const [head, ...rest] = p.split(".");
    if (head === "path") {
      nextPath[rest.join(".")] = fresh();
    } else if (head === "query") {
      nextQuery[rest.join(".")] = fresh();
    } else if (head === "headers") {
      nextHeaders[rest.join(".")] = fresh();
    } else if (head === "body") {
      if (typeof nextBody === "object") {
        // Multipart: flat key:value under body.
        nextBody = { ...(nextBody as Record<string, string>), [rest.join(".")]: fresh() };
      } else {
        // JSON body: parse once, set at nested path, restringify at end of loop.
        if (bodyJson === null) {
          try {
            const parsed =
              nextBody && (nextBody as string).trim() ? JSON.parse(nextBody as string) : {};
            bodyJson =
              parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : {};
          } catch {
            bodyJson = {};
          }
        }
        bodyJson = setAtPath(bodyJson, rest, fresh()) as Record<string, unknown>;
      }
    }
  }

  if (bodyJson !== null) {
    nextBody = JSON.stringify(bodyJson, null, 2);
  }

  return { path: nextPath, query: nextQuery, headers: nextHeaders, body: nextBody };
}

// Tiny immutable setter for nested object paths. Mirrors the one in runtimeInputs.ts;
// duplicated here to keep executor self-contained.
function setAtPath(obj: unknown, parts: string[], value: unknown): unknown {
  if (parts.length === 0) return value;
  const [head, ...rest] = parts;
  const target =
    obj && typeof obj === "object" && !Array.isArray(obj)
      ? { ...(obj as Record<string, unknown>) }
      : {};
  (target as Record<string, unknown>)[head] = setAtPath((target as any)[head], rest, value);
  return target;
}

function substituteValues(values: FormValues, context: Record<string, unknown>): FormValues {
  const path: Record<string, string> = {};
  for (const [k, v] of Object.entries(values.path)) path[k] = substituteTemplate(v, context);
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(values.query)) query[k] = substituteTemplate(v, context);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(values.headers)) headers[k] = substituteTemplate(v, context);
  let body: FormValues["body"];
  if (typeof values.body === "string") {
    // JSON-bodied endpoint: use the two-pass substitution so array/object refs land as
    // real JSON values, not stringified blobs.
    body = substituteJsonBody(values.body, context);
  } else {
    // Multipart: each field is its own scalar value; plain interpolation is fine.
    body = {};
    for (const [k, v] of Object.entries(values.body)) body[k] = substituteTemplate(v, context);
  }
  return { path, query, headers, body };
}

// ---- Topological order ---------------------------------------------------------------

export function topoOrder(workflow: Workflow): string[] {
  // Kahn's algorithm. If the graph has cycles, returns the partial order it managed plus
  // remaining nodes in arbitrary order.
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of workflow.nodes) {
    indeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of workflow.edges) {
    if (!indeg.has(e.source) || !indeg.has(e.target)) continue;
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    adj.get(e.source)!.push(e.target);
  }
  const queue: string[] = [];
  for (const [id, d] of indeg) if (d === 0) queue.push(id);
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (out.length < workflow.nodes.length) {
    // append remaining in original order; cycles will execute but may fail substitution
    for (const n of workflow.nodes) if (!out.includes(n.id)) out.push(n.id);
  }
  return out;
}

// ---- Execute -------------------------------------------------------------------------

export type ExecuteOptions = {
  profile: Profile;
  token: string;
  onNodeStart?: (nodeId: string) => void;
  onNodeFinish?: (nodeId: string, result: NodeResult) => void;
  /** Files keyed by `${nodeId}.${fieldName}` for multipart bodies. */
  files?: Record<string, File>;
  /**
   * Pre-computed NodeResults to inject for specific nodes (keyed by nodeId), bypassing
   * the REST executor. Useful for replaying / debugging; not the WSS path.
   */
  seedResults?: Record<string, NodeResult>;
  /**
   * Called when the executor reaches a WSS (Streams) node. The host opens the recording
   * modal, performs the live-stream session, and resolves with the aggregated NodeResult.
   * The executor pauses on `await` here — meaning the WSS node can sit anywhere in the
   * topo order, with upstream nodes' outputs already substituted into its path/body.
   * Rejecting the promise (e.g. user cancels) aborts the workflow with that error.
   */
  onWss?: (args: {
    node: WorkflowNode;
    endpoint: EndpointDef;
    /** node.values with `{{ref.field}}` templates resolved against `context` so far. */
    substitutedValues: FormValues;
  }) => Promise<NodeResult>;
};

export async function runWorkflow(workflow: Workflow, opts: ExecuteOptions): Promise<WorkflowRun> {
  const order = topoOrder(workflow);
  const nodeById: Record<string, WorkflowNode> = Object.fromEntries(
    workflow.nodes.map((n) => [n.id, n]),
  );
  const context: Record<string, unknown> = {};
  const nodeResults: Record<string, NodeResult> = {};
  // Populated as we substitute templates, so callers (history) can see exactly what was
  // sent to the wire per node.
  const nodeSentValues: Record<string, FormValues> = {};
  const nodeFileNames: Record<string, Record<string, string>> = {};
  const startedAt = new Date().toISOString();

  for (const nodeId of order) {
    const node = nodeById[nodeId];
    opts.onNodeStart?.(nodeId);

    // Pre-seeded result (e.g. from StreamRunModal) — bypass the REST executor entirely.
    // This is the only path WSS nodes ever execute through; without a seed they error out
    // because the executor can't host a recording UI.
    const seed = opts.seedResults?.[nodeId];
    if (seed) {
      context[nodeId] = seed.body;
      if (node.ref) context[node.ref] = seed.body;
      nodeResults[nodeId] = seed;
      opts.onNodeFinish?.(nodeId, seed);
      if (seed.error) break;
      continue;
    }

    const endpoint = endpointById[node.endpointId];
    if (!endpoint) {
      const result: NodeResult = {
        status: 0,
        body: null,
        durationMs: 0,
        error: `Unknown endpoint id "${node.endpointId}"`,
      };
      nodeResults[nodeId] = result;
      opts.onNodeFinish?.(nodeId, result);
      continue;
    }

    // WSS nodes pause the executor while the host opens a recording modal. The host's
    // onWss handler resolves with the aggregated NodeResult once the user clicks
    // "Run workflow with this output" in the modal. Path / body templates are
    // pre-substituted so the modal sees the resolved interaction id from upstream.
    if (endpoint.method === "WSS") {
      if (!opts.onWss) {
        const result: NodeResult = {
          status: 0,
          body: null,
          durationMs: 0,
          error:
            `Streams node "${node.ref ?? nodeId}" reached the executor without an onWss handler. ` +
            `WSS nodes need the workflow editor (or any host) to provide an onWss callback that ` +
            `hosts the recording UI and returns the aggregated NodeResult.`,
        };
        nodeResults[nodeId] = result;
        opts.onNodeFinish?.(nodeId, result);
        break;
      }
      try {
        const substituted = applyAutoGenerate(node, substituteValues(node.values, context));
        nodeSentValues[nodeId] = substituted;
        const result = await opts.onWss({ node, endpoint, substitutedValues: substituted });
        context[nodeId] = result.body;
        if (node.ref) context[node.ref] = result.body;
        nodeResults[nodeId] = result;
        opts.onNodeFinish?.(nodeId, result);
        if (result.error) break;
        continue;
      } catch (e: any) {
        const result: NodeResult = {
          status: 0,
          body: null,
          durationMs: 0,
          error: e?.message ?? String(e),
        };
        nodeResults[nodeId] = result;
        opts.onNodeFinish?.(nodeId, result);
        break;
      }
    }
    try {
      // 1. Template substitution → 2. auto-uuid overrides → 3. body-shaping pipeline
      //    (prune empty, strip wireOmit, preSendTransform). Order matters: auto-uuid
      //    must come after substitution (so it can't be clobbered by `{{ref}}` resolution)
      //    and before shape transforms (so preSendTransform sees the generated value).
      const substituted = applyAutoGenerate(node, substituteValues(node.values, context));
      const sendValues = shapeBodyForSend(endpoint, substituted);
      nodeSentValues[nodeId] = sendValues;
      const files: Record<string, File | undefined> = {};
      const fileNames: Record<string, string> = {};
      for (const [k, v] of Object.entries(opts.files ?? {})) {
        if (k.startsWith(`${nodeId}.`)) {
          const field = k.slice(nodeId.length + 1);
          files[field] = v;
          if (v) fileNames[field] = v.name;
        }
      }
      if (Object.keys(fileNames).length) nodeFileNames[nodeId] = fileNames;
      const exec = await executeRequest({
        endpoint,
        values: sendValues,
        files,
        profile: opts.profile,
        token: opts.token,
      });
      const httpFailed = exec.status >= 400;
      const result: NodeResult = {
        status: exec.status,
        body: exec.body,
        durationMs: exec.durationMs,
        error: httpFailed ? `${exec.status} ${exec.statusText}` : undefined,
        // For HTTP errors, build a copy-paste blob anchored on the response.
        // Successful runs leave errorDetail undefined.
        errorDetail: httpFailed
          ? {
              timestamp: new Date().toISOString(),
              name: "HttpError",
              message: `${exec.status} ${exec.statusText || "(no status text)"}`,
              kind: "http",
              preview: exec.preview,
              response: {
                status: exec.status,
                statusText: exec.statusText,
                headers: exec.responseHeaders,
                body: exec.body,
              },
            }
          : undefined,
      };
      // Make the response addressable by BOTH the UUID and the human-readable ref.
      // The UI encourages refs (`{{interactions_create_1.interactionId}}`), but legacy
      // workflows that used the UUID directly still resolve.
      context[nodeId] = exec.body;
      if (node.ref) context[node.ref] = exec.body;
      nodeResults[nodeId] = result;
      opts.onNodeFinish?.(nodeId, result);
      if (result.error) break; // stop on first failure for v1
    } catch (e: any) {
      const result: NodeResult = {
        status: 0,
        body: null,
        durationMs: 0,
        error: e?.message ?? String(e),
        errorDetail: buildErrorDetail(e),
      };
      nodeResults[nodeId] = result;
      opts.onNodeFinish?.(nodeId, result);
      break;
    }
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    nodeResults,
    nodeSentValues,
    nodeFileNames: Object.keys(nodeFileNames).length ? nodeFileNames : undefined,
  };
}
