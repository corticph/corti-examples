import { useMemo, useState } from "react";
import { Modal } from "../components/ui/Modal";
import { Pill } from "../components/ui/Pill";
import { copyText, formatErrorForCopy } from "./errors";
import {
  clearHistory,
  deleteHistoryEntry,
  type HistoryEntry,
  type HistoryNodeEntry,
  loadHistory,
} from "./history";

// Lists past workflow runs for the current workflow. Each row shows a compact summary;
// click to expand and inspect per-node sent values + response bodies (each with a copy
// button). localStorage-backed via history.ts — opening the modal triggers a fresh read,
// so a run that just finished shows up immediately.

export function RunHistoryModal({
  open,
  workflowId,
  refreshToken,
  onClose,
}: {
  open: boolean;
  workflowId: string;
  /** Incremented by the parent whenever a new run is saved, so we re-read on demand. */
  refreshToken: number;
  onClose: () => void;
}) {
  // Read history when the modal is open. Including `expandedId` ensures we re-read after
  // a delete action (which collapses the row) without relying on the parent to remount.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const entries = useMemo(
    () => (open ? loadHistory(workflowId) : []),
    [open, workflowId, refreshToken, expandedId],
  );

  return (
    <Modal open={open} onClose={onClose} title="Run history" widthClass="max-w-3xl">
      <div className="grid gap-3">
        <div className="flex items-center justify-between text-xs text-muted-700">
          <span>
            {entries.length} {entries.length === 1 ? "run" : "runs"} stored (max 20)
          </span>
          {entries.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Delete all run history for this workflow?")) {
                  clearHistory(workflowId);
                  onClose();
                }
              }}
              className="rounded border border-muted-300 bg-paper px-2 py-0.5 text-[10px] font-medium text-muted-700 hover:bg-paper-muted"
            >
              Clear all
            </button>
          )}
        </div>

        {entries.length === 0 ? (
          <p className="rounded border border-dashed border-muted-300 bg-paper-muted p-4 text-center text-sm text-muted-500">
            No runs yet. Hit <strong>Run workflow</strong> and they'll show up here, newest first.
          </p>
        ) : (
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto">
            {entries.map((entry) => (
              <RunRow
                key={entry.runId}
                entry={entry}
                expanded={expandedId === entry.runId}
                onToggle={() => setExpandedId((cur) => (cur === entry.runId ? null : entry.runId))}
                onDelete={() => {
                  deleteHistoryEntry(workflowId, entry.runId);
                  if (expandedId === entry.runId) setExpandedId(null);
                  // Force the memo to re-read by closing+reopening would be heavy;
                  // instead trust the parent's refreshToken on next mount. For now,
                  // hide via simple re-render via state below.
                }}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function RunRow({
  entry,
  expanded,
  onToggle,
  onDelete,
}: {
  entry: HistoryEntry;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const tone: "good" | "bad" | "neutral" =
    entry.status === "completed" ? "good" : entry.status === "error" ? "bad" : "neutral";
  return (
    <div className="rounded-lg border border-muted-300/60 bg-paper">
      <button
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-xs hover:bg-paper-muted"
      >
        <Chevron open={expanded} />
        <Pill tone={tone}>{entry.status}</Pill>
        <span className="font-mono text-muted-700">{formatLocal(entry.startedAt)}</span>
        <span className="text-muted-500">{(entry.durationMs / 1000).toFixed(2)}s</span>
        <span className="text-muted-500">·</span>
        <span className="text-muted-700">
          {entry.nodes.length} {entry.nodes.length === 1 ? "node" : "nodes"}
        </span>
        {entry.errorSummary && (
          <span className="ml-auto max-w-[40%] truncate text-red-700" title={entry.errorSummary}>
            {entry.errorSummary}
          </span>
        )}
      </button>
      {expanded && (
        <div className="border-t border-muted-300/40 p-3">
          <div className="mb-2 flex items-center gap-2">
            <button
              onClick={onDelete}
              className="rounded border border-red-300 bg-paper px-2 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-50"
            >
              Delete this run
            </button>
          </div>
          <div className="grid gap-2">
            {entry.nodes.map((n) => (
              <NodeRow key={n.nodeId} node={n} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NodeRow({ node }: { node: HistoryNodeEntry }) {
  const [tab, setTab] = useState<"sent" | "response" | "error">("response");
  const okTone = node.result.error
    ? "bad"
    : node.result.status >= 200 && node.result.status < 300
      ? "good"
      : "neutral";

  const sentText = node.sentValues
    ? JSON.stringify(node.sentValues, null, 2)
    : "(no sent values recorded)";
  const responseText =
    typeof node.result.body === "string"
      ? node.result.body
      : node.result.body == null
        ? "(empty)"
        : JSON.stringify(node.result.body, null, 2);
  const errorText = node.result.errorDetail
    ? formatErrorForCopy(node.result.errorDetail)
    : (node.result.error ?? "");
  const hasError = !!node.result.error;

  const current = tab === "sent" ? sentText : tab === "response" ? responseText : errorText;

  return (
    <div className="rounded border border-muted-300/40 bg-paper-muted p-2">
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px]">
        <Pill tone="accent">{node.method}</Pill>
        {node.ref && <span className="font-mono font-semibold text-ink">{node.ref}</span>}
        <span className="text-muted-500">{node.label ?? node.endpointId}</span>
        <Pill tone={okTone as any}>
          {node.result.status} {node.result.error ? "ERR" : ""}
        </Pill>
        <span className="text-muted-500">{node.result.durationMs}ms</span>
        {node.fileNames && Object.keys(node.fileNames).length > 0 && (
          <span
            className="rounded bg-paper px-1.5 py-0.5 text-[10px] text-muted-700"
            title={Object.entries(node.fileNames)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")}
          >
            files: {Object.keys(node.fileNames).length}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 border-b border-muted-300/40 text-xs">
        <TabBtn active={tab === "sent"} onClick={() => setTab("sent")}>
          Sent
        </TabBtn>
        <TabBtn active={tab === "response"} onClick={() => setTab("response")}>
          Response
        </TabBtn>
        {hasError && (
          <TabBtn active={tab === "error"} onClick={() => setTab("error")}>
            Error
          </TabBtn>
        )}
        <div className="ml-auto py-1">
          <CopyButton text={current} />
        </div>
      </div>
      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre rounded bg-ink p-2 text-[10px] leading-tight text-paper">
        {current.length > 8000 ? current.slice(0, 8000) + "\n…(truncated)" : current}
      </pre>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-2 py-1 text-[11px] font-medium transition-colors ${
        active ? "border-ink text-ink" : "border-transparent text-muted-500 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handle() {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  }
  return (
    <button
      onClick={handle}
      className="rounded border border-muted-300 bg-paper px-2 py-0.5 text-[10px] font-medium text-ink hover:bg-paper-muted"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`h-3 w-3 shrink-0 text-muted-500 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function formatLocal(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}
