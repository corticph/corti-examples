import type { FormValues } from "../endpoints/types";
import type { NodeResult, WorkflowRun } from "./types";

// Run-history persistence. localStorage-backed, per-workflow, capped at MAX_PER_WORKFLOW
// entries (newest-first eviction). The shape mirrors WorkflowRun but flattens the node
// data so the history view can render rows without re-correlating ids.
//
// Limits:
//   - localStorage is ~5MB per origin. Each entry is dominated by node response bodies,
//     typically 1-50KB. Capping at 20 runs per workflow keeps us comfortably under 1MB
//     per workflow even for response-heavy chains.
//   - File contents are never persisted (Files don't serialize and would explode the
//     cap). Filenames ARE persisted so the history shows "you attached test.m4a here".

const KEY_PREFIX = "corti.workflowRuns.";
const MAX_PER_WORKFLOW = 20;

export type HistoryNodeEntry = {
  nodeId: string;
  ref?: string;
  label?: string;
  endpointId: string;
  method: string;
  /** Values sent to the wire after template substitution. */
  sentValues?: FormValues;
  /** Files attached, by field name. Just the filenames — we don't persist contents. */
  fileNames?: Record<string, string>;
  result: NodeResult;
};

export type HistoryEntry = {
  runId: string;
  workflowId: string;
  workflowName: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: "completed" | "error" | "cancelled";
  /** First error message encountered during the run, for the row summary. */
  errorSummary?: string;
  nodes: HistoryNodeEntry[];
};

function keyFor(workflowId: string): string {
  return KEY_PREFIX + workflowId;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadHistory(workflowId: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(keyFor(workflowId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: HistoryEntry): void {
  const cur = loadHistory(entry.workflowId);
  // Newest-first; evict the oldest once we cross the cap. Deep copy isn't needed since
  // the caller hands us a fresh entry.
  const next = [entry, ...cur].slice(0, MAX_PER_WORKFLOW);
  try {
    localStorage.setItem(keyFor(entry.workflowId), JSON.stringify(next));
  } catch (e) {
    // QuotaExceededError is the realistic failure here. Halve the retention and retry
    // once so we degrade gracefully on quota-pressured profiles.
    try {
      const trimmed = next.slice(0, Math.floor(MAX_PER_WORKFLOW / 2));
      localStorage.setItem(keyFor(entry.workflowId), JSON.stringify(trimmed));
    } catch {
      /* give up silently — history is best-effort */
    }
    // eslint-disable-next-line no-console
    console.warn("[history] save failed, retried with smaller retention", e);
  }
}

export function clearHistory(workflowId: string): void {
  try {
    localStorage.removeItem(keyFor(workflowId));
  } catch {
    /* ignore */
  }
}

export function deleteHistoryEntry(workflowId: string, runId: string): void {
  const cur = loadHistory(workflowId);
  const next = cur.filter((e) => e.runId !== runId);
  try {
    localStorage.setItem(keyFor(workflowId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/**
 * Build a HistoryEntry from the WorkflowRun the executor returned. The host already
 * has the workflow + endpoint metadata, so it passes those in alongside.
 */
export function buildHistoryEntry(input: {
  workflowId: string;
  workflowName: string;
  run: WorkflowRun;
  /** Lookup so we can stamp the endpoint method on each row without re-resolving downstream. */
  nodeMeta: Record<string, { ref?: string; label?: string; endpointId: string; method: string }>;
  /** Final status — derived by the host since "cancelled" lives in a thrown error path. */
  status: HistoryEntry["status"];
  errorSummary?: string;
}): HistoryEntry {
  const { workflowId, workflowName, run, nodeMeta, status, errorSummary } = input;
  const startedAt = run.startedAt;
  const finishedAt = run.finishedAt ?? new Date().toISOString();
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  const nodes: HistoryNodeEntry[] = Object.entries(run.nodeResults).map(([nodeId, result]) => {
    const meta = nodeMeta[nodeId] ?? { endpointId: "(unknown)", method: "?" };
    return {
      nodeId,
      ref: meta.ref,
      label: meta.label,
      endpointId: meta.endpointId,
      method: meta.method,
      sentValues: run.nodeSentValues?.[nodeId],
      fileNames: run.nodeFileNames?.[nodeId],
      result,
    };
  });

  return {
    runId: uid(),
    workflowId,
    workflowName,
    startedAt,
    finishedAt,
    durationMs,
    status,
    errorSummary,
    nodes,
  };
}
