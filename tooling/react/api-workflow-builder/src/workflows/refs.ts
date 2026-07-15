import type { Workflow, WorkflowEdge, WorkflowNode } from "./types";

// Helpers for generating and maintaining short human-readable refs on workflow nodes.
// Refs are used by `{{ref.field}}` template substitution in the executor — they're a much
// nicer thing to type and read than a UUID. See executor.ts for the lookup logic.

function endpointSlug(endpointId: string): string {
  return (
    endpointId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "node"
  );
}

/**
 * Generate a unique ref like `interactions_create_1`, suffixing the next available integer
 * so multiple nodes for the same endpoint each get a distinct slug.
 */
export function generateRef(endpointId: string, existingRefs: Iterable<string>): string {
  const taken = new Set(existingRefs);
  const base = endpointSlug(endpointId);
  let n = 1;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/**
 * Reverse-BFS from `nodeId` through `edges` to collect every node that can reach the target
 * — i.e. every node guaranteed to run before it under topo order. These are the only nodes
 * a downstream `{{ref.field}}` template is safe to reference, so the "Available from
 * upstream" picker uses this list.
 */
export function getUpstreamNodes(
  nodeId: string,
  edges: WorkflowEdge[],
  nodes: WorkflowNode[],
): WorkflowNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const reachable = new Set<string>();
  const queue: string[] = [nodeId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of edges) {
      if (e.target === cur && !reachable.has(e.source)) {
        reachable.add(e.source);
        queue.push(e.source);
      }
    }
  }
  return [...reachable].map((id) => byId.get(id)).filter((n): n is WorkflowNode => !!n);
}

/**
 * Backfill `ref` on any node that doesn't have one yet. Pure — returns the same workflow
 * object when nothing changes, so React effects don't fire unnecessarily.
 */
export function ensureRefs(workflow: Workflow): Workflow {
  const refs = new Set<string>(
    workflow.nodes
      .map((n) => n.ref)
      .filter((r): r is string => typeof r === "string" && r.length > 0),
  );
  let changed = false;
  const nodes = workflow.nodes.map((n) => {
    if (n.ref) return n;
    const ref = generateRef(n.endpointId, refs);
    refs.add(ref);
    changed = true;
    return { ...n, ref };
  });
  return changed ? { ...workflow, nodes } : workflow;
}
