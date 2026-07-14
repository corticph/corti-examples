import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { useState } from "react";
import { Pill } from "../components/ui/Pill";
import { endpointById } from "../endpoints/registry";
import { copyText, formatErrorForCopy } from "./errors";
import type { NodeResult } from "./types";

export type EndpointNodeData = {
  endpointId: string;
  label?: string;
  result?: NodeResult;
  status?: "idle" | "running" | "ok" | "error";
};

// Big, obvious handles. The previous 12px circles were near-invisible against the white
// node card (Tailwind preflight + a 1px ink border makes them functionally a dot), so users
// thought connections were broken. These are 14px with a 2px border and a contrasting fill —
// you can actually see them, and the click target is large enough to drag from confidently.
const HANDLE_BASE =
  "!w-3.5 !h-3.5 !rounded-full !border-2 !border-ink !bg-accent " +
  "hover:!bg-ink hover:!scale-125 transition-transform";

export function EndpointNode({ data, selected }: NodeProps) {
  const d = data as EndpointNodeData;
  const endpoint = endpointById[d.endpointId];
  const status = d.status ?? "idle";

  const tone =
    status === "running"
      ? "warn"
      : status === "ok"
        ? "good"
        : status === "error"
          ? "bad"
          : "neutral";

  return (
    <div
      className={`relative min-w-[240px] rounded-lg border bg-paper shadow-card transition-colors ${
        selected ? "border-ink" : "border-muted-300/60"
      }`}
    >
      <Handle type="target" position={Position.Left} className={HANDLE_BASE} />
      <div className="flex items-center justify-between gap-2 border-b border-muted-300/60 px-3 py-2">
        <div className="flex items-center gap-2">
          {endpoint && <Pill tone="accent">{endpoint.method}</Pill>}
          <div className="text-sm font-semibold">{d.label ?? endpoint?.label ?? d.endpointId}</div>
        </div>
        <Pill tone={tone as any}>{status}</Pill>
      </div>
      <div className="px-3 py-2 text-xs text-muted-500">
        {endpoint ? (
          <span className="font-mono">{endpoint.path}</span>
        ) : (
          <span className="text-red-700">unknown endpoint: {d.endpointId}</span>
        )}
      </div>
      {d.result && (
        <div className="border-t border-muted-300/60 px-3 py-2 text-xs">
          {d.result.error ? <ErrorBlock result={d.result} /> : <ResultBlock result={d.result} />}
        </div>
      )}
      <Handle type="source" position={Position.Right} className={HANDLE_BASE} />
    </div>
  );
}

// Renders the per-node error block with one-line summary, Copy button, and a Details
// toggle that reveals the full text blob (request preview + response/cause/stack).
// The full blob is always copy-paste-ready — no UI re-formatting required.
function ErrorBlock({ result }: { result: NodeResult }) {
  const detail = result.errorDetail;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const blob = detail ? formatErrorForCopy(detail) : (result.error ?? "");
  async function handleCopy() {
    const ok = await copyText(blob);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  }

  return (
    <div className="grid gap-1.5">
      <div className="font-medium text-red-700">{result.error}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={handleCopy}
          className="rounded border border-red-300 bg-paper px-2 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-50"
        >
          {copied ? "Copied" : "Copy error"}
        </button>
        {detail && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded border border-muted-300 bg-paper px-2 py-0.5 text-[10px] font-medium text-ink hover:bg-paper-muted"
          >
            {open ? "Hide details" : "Show details"}
          </button>
        )}
        {detail?.kind && (
          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-red-700">
            {detail.kind}
          </span>
        )}
      </div>
      {open && detail && (
        // Bounded box with both scrollbars: a long URL or response body would otherwise
        // stretch the whole node sideways. nodrag lets the user select text without
        // ReactFlow grabbing the click; nowheel keeps mousewheel scrolling local to the
        // pre instead of bubbling up and zooming the whole canvas.
        <pre className="nodrag nowheel mt-1 max-h-72 w-[480px] max-w-[min(480px,80vw)] overflow-auto whitespace-pre rounded border border-muted-300/60 bg-ink p-2 text-[10px] leading-tight text-paper">
          {blob}
        </pre>
      )}
    </div>
  );
}

// Successful run summary. Body is hidden by default so the node keeps the same height
// before and after a run; click "Show body" to inspect inline. State is component-local
// so toggling persists for the lifetime of the page session.
function ResultBlock({ result }: { result: NodeResult }) {
  const [open, setOpen] = useState(false);
  // Try each text-view extractor in turn — first hit wins. Documents are rendered as
  // section-heading prose; agent message/task responses are rendered as the dialogue
  // turns + latest agent reply. Anything else just gets the JSON view.
  const textView = detectTextView(result.body);
  const [view, setView] = useState<"json" | "text">("json");
  const [copied, setCopied] = useState(false);

  const jsonText =
    typeof result.body === "string"
      ? result.body
      : result.body == null
        ? "(empty)"
        : JSON.stringify(result.body, null, 2);
  const displayed = view === "text" && textView ? textView : jsonText;

  async function copyDisplayed() {
    const ok = await copyText(displayed);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-muted-700">
          {result.status} · {result.durationMs}ms
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded border border-muted-300 bg-paper px-2 py-0.5 text-[10px] font-medium text-ink hover:bg-paper-muted"
        >
          {open ? "Hide body" : "Show body"}
        </button>
        {open && textView && (
          <>
            <button
              onClick={() => setView("json")}
              className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                view === "json"
                  ? "bg-ink text-paper"
                  : "border border-muted-300 bg-paper text-ink hover:bg-paper-muted"
              }`}
            >
              JSON
            </button>
            <button
              onClick={() => setView("text")}
              className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                view === "text"
                  ? "bg-ink text-paper"
                  : "border border-muted-300 bg-paper text-ink hover:bg-paper-muted"
              }`}
            >
              Show in text
            </button>
          </>
        )}
        {open && (
          <button
            onClick={copyDisplayed}
            className="rounded border border-muted-300 bg-paper px-2 py-0.5 text-[10px] font-medium text-ink hover:bg-paper-muted"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      {open && (
        <pre
          className={`nodrag nowheel mt-0.5 max-h-72 w-[480px] max-w-[min(480px,80vw)] overflow-auto rounded p-2 text-[10px] leading-tight ${
            view === "text" && textView
              ? "whitespace-pre-wrap bg-paper-muted text-ink"
              : "whitespace-pre bg-ink text-paper"
          }`}
        >
          {displayed.length > 8000 ? displayed.slice(0, 8000) + "\n…(truncated)" : displayed}
        </pre>
      )}
    </div>
  );
}

/**
 * Try each known response shape until one matches; return a readable text rendering of
 * it (or null if no shape matches, in which case only the JSON view is offered).
 *
 *   - Documents (documents.create / .get): `sections: [{key, name, text}]`
 *     → headings + section bodies
 *   - Agent message (agents.messageSend kind=message): `parts: [{kind:"text", text}]`
 *     → concatenated text parts
 *   - Agent task (agents.messageSend kind=task / agents.getTask): `history[]` +
 *     `status.message` + `artifacts[]`
 *     → conversation transcript with roles + status + any artifact text
 */
function detectTextView(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;

  // Documents (documents.create / .get)
  const sections = obj.sections;
  if (
    Array.isArray(sections) &&
    sections.length > 0 &&
    sections.every((s) => s && typeof s === "object" && typeof (s as any).text === "string")
  ) {
    return sections
      .map((s: any) => {
        const heading = s.name ?? s.key ?? "(section)";
        return `# ${heading}\n\n${String(s.text).trim()}`;
      })
      .join("\n\n");
  }

  // Agent message/task — messageSend wraps the union under `task` or `message`, but
  // getTask returns the raw shape. Try every candidate so all three response shapes work.
  const candidates: Record<string, unknown>[] = [obj];
  if (obj.task && typeof obj.task === "object" && !Array.isArray(obj.task)) {
    candidates.push(obj.task as Record<string, unknown>);
  }
  if (obj.message && typeof obj.message === "object" && !Array.isArray(obj.message)) {
    candidates.push(obj.message as Record<string, unknown>);
  }
  for (const c of candidates) {
    const rendered = renderAgentResponse(c);
    if (rendered) return rendered;
  }

  return null;
}

// Render a task or message shape (post-unwrap) as a conversation transcript with
// status line, history turns, latest agent reply, and artifact texts. Returns null
// when the candidate has no recognisable agent content.
function renderAgentResponse(obj: Record<string, unknown>): string | null {
  const isTask = !!obj.status || Array.isArray(obj.history) || Array.isArray(obj.artifacts);
  if (isTask) {
    const turns: string[] = [];
    const history = Array.isArray(obj.history) ? (obj.history as any[]) : [];
    for (const m of history) {
      const text = textFromParts(m?.parts);
      if (text) turns.push(`# ${formatRole(m?.role)}\n\n${text.trim()}`);
    }
    const status = obj.status as any;
    const latestMessage = status?.message;
    if (latestMessage) {
      const text = textFromParts(latestMessage?.parts);
      if (text)
        turns.push(`# ${formatRole(latestMessage?.role ?? "agent")} (latest)\n\n${text.trim()}`);
    }
    const artifacts = Array.isArray(obj.artifacts) ? (obj.artifacts as any[]) : [];
    for (const a of artifacts) {
      const text = textFromParts(a?.parts);
      if (text)
        turns.push(`# Artifact: ${a?.name ?? a?.artifactId ?? "(unnamed)"}\n\n${text.trim()}`);
    }
    if (status?.state) turns.unshift(`Status: ${status.state}`);
    return turns.length > 0 ? turns.join("\n\n") : null;
  }

  // Message shape — direct message response, just join text parts.
  const parts = obj.parts;
  if (Array.isArray(parts)) {
    const text = textFromParts(parts);
    if (text) return text.trim();
  }
  return null;
}

// Collect the text content from an A2A parts array. Each part is `{kind, text?, ...}`;
// non-text kinds (file, data) get a placeholder so the user can see something was there.
function textFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  const out: string[] = [];
  for (const p of parts) {
    if (!p || typeof p !== "object") continue;
    const kind = (p as any).kind;
    if (kind === "text" && typeof (p as any).text === "string") {
      out.push((p as any).text);
    } else if (kind === "file") {
      const f = (p as any).file ?? {};
      out.push(`[file: ${f.name ?? f.uri ?? "(file)"}]`);
    } else if (kind === "data") {
      out.push("[data part]");
    }
  }
  return out.join("\n\n");
}

function formatRole(role: unknown): string {
  if (typeof role !== "string" || role.length === 0) return "Agent";
  return role.charAt(0).toUpperCase() + role.slice(1);
}
