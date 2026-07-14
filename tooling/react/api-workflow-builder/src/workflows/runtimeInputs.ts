import type { EndpointDef } from "../endpoints/types";
import type { Ask, PreRunValues } from "./PreRunModal";
import type { Workflow, WorkflowNode } from "./types";

// Collects the list of asks (text fields + files) the user needs to provide before a
// workflow run. Two sources:
//   1. Every node with a binary or multipart-file endpoint where the corresponding
//      file isn't already in filesRef. Files can't be persisted across sessions, so
//      they're always uploaded at run time.
//   2. Every node's `runtimeFields` entries — fields the user explicitly toggled to
//      "ask at run time" via the star icon.
// The two sets are emitted in node-order so the modal renders top-to-bottom in
// execution order.
export function gatherAsks(
  workflow: Workflow,
  files: Record<string, File>,
  endpointById: Record<string, EndpointDef>,
): Ask[] {
  const asks: Ask[] = [];
  for (const node of workflow.nodes) {
    const endpoint = endpointById[node.endpointId];
    if (!endpoint) continue;
    // WSS nodes don't go through the REST asks pipeline — their config is collected by
    // StreamRunModal directly from node.values, and the path-param interaction id is
    // picked statically in the edit panel.
    if (endpoint.method === "WSS") continue;
    const nodeRef = node.ref ?? node.id.slice(0, 8);
    const nodeLabel = node.label ?? endpoint.label;

    // File asks (always when missing) — binary body
    if (endpoint.body?.kind === "binary") {
      const key = `${node.id}._body`;
      if (!files[key]) {
        asks.push({
          kind: "file",
          nodeId: node.id,
          nodeRef,
          nodeLabel,
          label: "body (binary)",
          fileFieldName: "_body",
          accept: endpoint.body.accept,
          required: true,
        });
      }
    }
    // File asks — multipart file fields
    if (endpoint.body?.kind === "multipart") {
      for (const f of endpoint.body.fields) {
        if (f.kind !== "file") continue;
        const key = `${node.id}.${f.name}`;
        if (!files[key]) {
          asks.push({
            kind: "file",
            nodeId: node.id,
            nodeRef,
            nodeLabel,
            label: f.name,
            fileFieldName: f.name,
            accept: f.accept,
            required: f.required ?? true,
          });
        }
      }
    }

    // Text asks — explicit runtime flags. Skip any path that's also flagged auto-uuid,
    // since the executor will overwrite that value at run time anyway — no point asking.
    const autoSet = new Set(node.autoGenerateFields ?? []);
    for (const path of node.runtimeFields ?? []) {
      if (autoSet.has(path)) continue;
      const ask = textAskForPath(node, path, nodeRef, nodeLabel);
      if (ask) asks.push(ask);
    }
  }
  return asks;
}

// Translate a runtime path like "body.identifier" into a text Ask with the right target
// shape and a default value pulled from the node's existing FormValues.
function textAskForPath(
  node: WorkflowNode,
  path: string,
  nodeRef: string,
  nodeLabel: string,
): Ask | null {
  const [head, ...rest] = path.split(".");
  const restPath = rest.join(".");
  const common = { kind: "text" as const, nodeId: node.id, nodeRef, nodeLabel };
  switch (head) {
    case "path": {
      const name = restPath;
      return {
        ...common,
        label: path,
        defaultValue: node.values.path[name] ?? "",
        target: { kind: "path", name },
      };
    }
    case "query": {
      const name = restPath;
      return {
        ...common,
        label: path,
        defaultValue: node.values.query[name] ?? "",
        target: { kind: "query", name },
      };
    }
    case "headers": {
      const name = restPath;
      return {
        ...common,
        label: path,
        defaultValue: node.values.headers[name] ?? "",
        target: { kind: "header", name },
      };
    }
    case "body": {
      // Body is either an object (multipart) or a JSON string (json endpoints).
      // For object bodies, the first segment is the field name.
      if (typeof node.values.body === "object") {
        const name = restPath;
        return {
          ...common,
          label: path,
          defaultValue: (node.values.body as Record<string, string>)[name] ?? "",
          target: { kind: "body-multipart", name },
        };
      }
      // JSON body — look up the path in the parsed object for the default.
      const parsed = parseBody(node.values.body as string);
      const pathParts = restPath.split(".").filter(Boolean);
      const def = getAt(parsed, pathParts);
      return {
        ...common,
        label: path,
        defaultValue: typeof def === "string" ? def : def == null ? "" : JSON.stringify(def),
        target: { kind: "body-json", path: pathParts },
        multiline: typeof def === "string" && def.length > 80,
      };
    }
    default:
      return null;
  }
}

function parseBody(body: string): Record<string, unknown> {
  if (!body || !body.trim()) return {};
  try {
    const v = JSON.parse(body);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function getAt(obj: unknown, path: string[]): unknown {
  let cur: any = obj;
  for (const p of path) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setAt(obj: unknown, path: string[], value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const target =
    obj && typeof obj === "object" && !Array.isArray(obj)
      ? { ...(obj as Record<string, unknown>) }
      : {};
  (target as Record<string, unknown>)[head] = setAt((target as any)[head], rest, value);
  return target;
}

/**
 * Apply collected runtime inputs to produce a per-run workflow snapshot (mutates
 * node values) and a per-run files dict (mutates filesRef). Returns the updated snapshot
 * so the run uses the run-time values without polluting persisted state.
 */
export function applyAsks(
  workflow: Workflow,
  asks: Ask[],
  values: PreRunValues,
  filesRef: Record<string, File>,
): Workflow {
  // Texts grouped by node so we can re-stringify the JSON body once per node.
  const byNode = new Map<string, { ask: Ask; idx: number }[]>();
  asks.forEach((ask, idx) => {
    const arr = byNode.get(ask.nodeId) ?? [];
    arr.push({ ask, idx });
    byNode.set(ask.nodeId, arr);
  });

  const nextNodes = workflow.nodes.map((node) => {
    const items = byNode.get(node.id);
    if (!items || items.length === 0) return node;
    let nextPath = { ...node.values.path };
    let nextQuery = { ...node.values.query };
    let nextHeaders = { ...node.values.headers };
    let nextBody: WorkflowNode["values"]["body"] = node.values.body;
    let bodyJson: Record<string, unknown> | null = null;

    for (const { ask, idx } of items) {
      if (ask.kind === "file") {
        const f = values.files[String(idx)];
        if (f) filesRef[`${node.id}.${ask.fileFieldName}`] = f;
        continue;
      }
      const v = values.texts[String(idx)] ?? "";
      const t = ask.target;
      if (t.kind === "path") nextPath[t.name] = v;
      else if (t.kind === "query") nextQuery[t.name] = v;
      else if (t.kind === "header") nextHeaders[t.name] = v;
      else if (t.kind === "body-multipart") {
        if (typeof nextBody !== "object") nextBody = {};
        nextBody = { ...(nextBody as Record<string, string>), [t.name]: v };
      } else if (t.kind === "body-json") {
        if (bodyJson === null) bodyJson = parseBody(node.values.body as string);
        bodyJson = setAt(bodyJson, t.path, v) as Record<string, unknown>;
      }
    }

    if (bodyJson !== null) {
      nextBody = JSON.stringify(bodyJson, null, 2);
    }

    return {
      ...node,
      values: { path: nextPath, query: nextQuery, headers: nextHeaders, body: nextBody },
    };
  });

  return { ...workflow, nodes: nextNodes };
}
