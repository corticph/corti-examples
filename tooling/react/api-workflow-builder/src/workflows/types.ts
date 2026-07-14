import type { FormValues } from "../endpoints/types";
import type { RequestPreview } from "../lib/requestExecutor";

export type WorkflowNode = {
  id: string; // UUID, unique within the workflow
  /**
   * Short human-readable slug used in `{{ref.field}}` template substitution
   * (e.g. "interactions_create_1"). Unique within the workflow. Auto-generated
   * on creation; the executor accepts BOTH this and the UUID as substitution keys
   * so older workflows that referenced UUIDs keep working.
   */
  ref?: string;
  endpointId: string; // ref into endpointById
  label?: string; // user-friendly name on the canvas
  values: FormValues; // includes raw body text that may contain {{...}} refs
  position: { x: number; y: number };
  /**
   * Dotted-path keys for fields that should be prompted at run time instead of
   * using their saved value. Examples: "path.id", "query.limit", "headers.X-Foo",
   * "body.identifier", "files._body" (binary). When the user clicks Run, the
   * pre-run modal collects values for each of these (plus any missing binary/
   * multipart file inputs, which are always asked because Files can't persist).
   */
  runtimeFields?: string[];
  /**
   * Dotted-path keys for fields that should be OVERWRITTEN with a freshly generated
   * UUID at every run, with no modal interaction. Use case: `encounter.identifier`
   * on Create Interaction — Corti tombstones identifiers even after delete, so the
   * same value can never be reused. Toggling auto-uuid produces a unique value per run.
   *
   * Takes precedence over `runtimeFields` for the same path (auto-gen wins — the modal
   * skips fields that will be overwritten anyway). Saved value is preserved but unused
   * while this is on, so you can toggle off to restore.
   */
  autoGenerateFields?: string[];
};

export type WorkflowEdge = {
  id: string;
  source: string; // node id
  target: string; // node id
};

export type Workflow = {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Rich, copy-paste-ready error payload attached to a NodeResult when a request fails.
 * Captures everything the request-executor's `ExecutionError` carries plus, for HTTP
 * failures (status >= 400), the response details too. The UI uses this for the
 * "Copy error" button — sending support a complete diagnostic blob with one click.
 */
export type NodeErrorDetail = {
  timestamp: string;
  name: string; // e.g. "TypeError", "Error"
  message: string;
  kind?: "build" | "network" | "abort" | "http";
  causeText?: string; // formatted cause chain
  stack?: string;
  preview?: RequestPreview;
  response?: {
    status: number;
    statusText: string;
    headers?: Record<string, string>;
    body: unknown;
  };
};

export type NodeResult = {
  status: number;
  body: unknown;
  durationMs: number;
  /** Short human-readable error summary (one line). */
  error?: string;
  /** Full error detail for the Copy/Details UI. Set whenever `error` is set. */
  errorDetail?: NodeErrorDetail;
};

export type WorkflowRun = {
  startedAt: string;
  finishedAt?: string;
  nodeResults: Record<string, NodeResult>; // by node.id
  /**
   * For each node that ran, the FormValues after template substitution — i.e. exactly
   * what was sent to the wire (path/query/headers + body JSON). Used by the run
   * history to show "what did this node actually send?" alongside the response.
   * Files are not included (File objects don't serialise); filenames are kept in
   * `nodeFileNames` instead.
   */
  nodeSentValues?: Record<string, FormValues>;
  /** Filenames keyed by node id, only when files were attached at run time. */
  nodeFileNames?: Record<string, Record<string, string>>;
};
