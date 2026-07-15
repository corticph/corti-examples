import { useState } from "react";
import { EndpointForm } from "../components/EndpointForm";
import { Input, Label } from "../components/ui/Input";
import { Pill } from "../components/ui/Pill";
import { endpointById } from "../endpoints/registry";
import type { ResponseField } from "../endpoints/types";
import type { WorkflowNode } from "./types";

// Per-node editor in the workflow designer. Delegates the actual form rendering to
// EndpointForm so the inputs look identical to the standalone endpoint page.
//
// Adds an "Available from upstream" section that lists every node connected to this one
// via incoming edges, with their documented response shape. Clicking a field copies the
// `{{ref.path}}` template string to the clipboard so the user can paste it into any input.
export function NodeEditor({
  node,
  upstreamNodes,
  onChange,
  onRemove,
  files,
  onFile,
}: {
  node: WorkflowNode;
  /** Nodes reachable via incoming edges (transitively). Already filtered by the parent. */
  upstreamNodes: WorkflowNode[];
  onChange: (patch: Partial<WorkflowNode>) => void;
  onRemove: () => void;
  files: Record<string, File | undefined>;
  onFile: (fieldName: string, file: File | undefined) => void;
}) {
  const endpoint = endpointById[node.endpointId];
  if (!endpoint) {
    return (
      <div className="text-sm text-red-700">
        Unknown endpoint: <code>{node.endpointId}</code>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-1.5">
        <Label>Node label</Label>
        <Input
          value={node.label ?? ""}
          placeholder={endpoint.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-500">
          <Pill tone="accent">{endpoint.method}</Pill>
          <span className="font-mono">{endpoint.path}</span>
          {node.ref && (
            <>
              <span className="text-muted-300">·</span>
              <span className="font-mono text-muted-700">
                ref: <code className="rounded bg-paper-muted px-1 py-0.5">{node.ref}</code>
              </span>
            </>
          )}
        </div>
      </div>

      <UpstreamOutputs nodes={upstreamNodes} />

      <EndpointForm
        endpoint={endpoint}
        values={node.values}
        onChange={(patch) => onChange({ values: { ...node.values, ...patch } })}
        files={files}
        onFile={onFile}
        runtime={{
          paths: new Set(node.runtimeFields ?? []),
          onToggle: (path) => {
            const cur = new Set(node.runtimeFields ?? []);
            if (cur.has(path)) cur.delete(path);
            else cur.add(path);
            onChange({ runtimeFields: [...cur] });
          },
          autoUuid: new Set(node.autoGenerateFields ?? []),
          onToggleAutoUuid: (path) => {
            const cur = new Set(node.autoGenerateFields ?? []);
            if (cur.has(path)) cur.delete(path);
            else cur.add(path);
            onChange({ autoGenerateFields: [...cur] });
          },
        }}
        bodyHint={
          endpoint.body?.kind === "json" ? (
            <>
              Use <code className="font-mono">{`{{ref.field}}`}</code> to interpolate values from an
              upstream node's response. Click a field in <em>Available from upstream</em> above to
              copy a reference. Click <strong>☆ runtime</strong> on any field to be asked for the
              value each time you Run.
              <br />
              <span className="text-muted-700">
                Built-ins (resolved fresh on every run, no modal):{" "}
                <code className="font-mono">{`{{$uuid}}`}</code>,{" "}
                <code className="font-mono">{`{{$timestamp}}`}</code>,{" "}
                <code className="font-mono">{`{{$epoch}}`}</code> — use these instead of{" "}
                <strong>☆ runtime</strong> when you just need a fresh unique value every run (e.g.{" "}
                <code className="font-mono">"identifier": "run-&#123;&#123;$uuid&#125;&#125;"</code>{" "}
                so Corti's tombstoned-identifier check doesn't trip).
              </span>
            </>
          ) : undefined
        }
      />

      <div className="flex justify-end border-t border-muted-300/60 pt-3">
        <button
          onClick={onRemove}
          className="rounded-lg border border-red-300 bg-paper px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
        >
          Remove node
        </button>
      </div>
    </div>
  );
}

// ---- UpstreamOutputs ---------------------------------------------------------

function UpstreamOutputs({ nodes }: { nodes: WorkflowNode[] }) {
  if (nodes.length === 0) {
    return (
      <details className="rounded-lg border border-muted-300/40 bg-paper-muted px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-500">
          Available from upstream
        </summary>
        <p className="mt-2 text-xs text-muted-500">
          No upstream nodes connected yet. Drag from another node's right handle to this node's left
          handle to make its response available here as <code>{`{{ref.field}}`}</code>.
        </p>
      </details>
    );
  }
  return (
    <details open className="rounded-lg border border-muted-300/40 bg-paper-muted px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-500">
        Available from upstream{" "}
        <span className="font-normal normal-case tracking-normal text-muted-500">
          ({nodes.length})
        </span>
      </summary>
      <div className="mt-2 grid gap-2">
        {nodes.map((n) => (
          <UpstreamNodeBlock key={n.id} node={n} />
        ))}
        <p className="text-[11px] text-muted-500">
          Click any field to copy <code>{`{{ref.path}}`}</code> to your clipboard, then paste it
          into a Params / Headers / Body input.
        </p>
      </div>
    </details>
  );
}

function UpstreamNodeBlock({ node }: { node: WorkflowNode }) {
  const endpoint = endpointById[node.endpointId];
  const ref = node.ref ?? node.id;
  const responseSchema = endpoint?.responseSchema;
  return (
    <div className="rounded border border-muted-300/40 bg-paper p-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {endpoint && <Pill tone="accent">{endpoint.method}</Pill>}
        <span className="font-mono font-semibold text-ink">{ref}</span>
        <span className="text-muted-500">{node.label ?? endpoint?.label ?? node.endpointId}</span>
      </div>
      {responseSchema && responseSchema.length > 0 ? (
        <ul className="mt-2 grid gap-0.5 pl-0">
          {responseSchema.map((f) => (
            <FieldRow key={f.name} field={f} pathParts={[]} refSlug={ref} />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[11px] italic text-muted-500">
          Response shape not documented yet. You can still reference fields by name with{" "}
          <code>{`{{${ref}.field}}`}</code> if you know what the endpoint returns.
        </p>
      )}
    </div>
  );
}

function FieldRow({
  field,
  pathParts,
  refSlug,
}: {
  field: ResponseField;
  pathParts: string[];
  refSlug: string;
}) {
  const nextPath = [...pathParts, field.name];
  const refString = `{{${refSlug}.${nextPath.join(".")}}}`;
  const [copied, setCopied] = useState(false);
  const hasChildren = field.kind === "object" || (field.kind === "array" && !!field.item);

  async function copy() {
    try {
      await navigator.clipboard.writeText(refString);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard API can fail in non-secure contexts. Fall back to a manual select.
      const ta = document.createElement("textarea");
      ta.value = refString;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {}
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  }

  return (
    <li className="text-xs">
      {hasChildren ? (
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-paper-muted">
            <Chevron />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                copy();
              }}
              className="flex flex-1 items-center gap-1.5 text-left"
              title={`Copy ${refString}`}
            >
              <span className="font-mono text-ink">{field.name}</span>
              <KindChip kind={field.kind} />
              {field.description && (
                <span className="truncate text-muted-500">{field.description}</span>
              )}
              {copied && <span className="ml-auto text-[10px] text-emerald-700">copied</span>}
            </button>
          </summary>
          <ul className="ml-4 mt-0.5 grid gap-0.5 border-l border-muted-300/60 pl-2">
            {field.kind === "object" &&
              (field.fields ?? []).map((sub) => (
                <FieldRow key={sub.name} field={sub} pathParts={nextPath} refSlug={refSlug} />
              ))}
            {field.kind === "array" && field.item && (
              <ArrayItemRow item={field.item} pathParts={nextPath} refSlug={refSlug} />
            )}
          </ul>
        </details>
      ) : (
        <button
          type="button"
          onClick={copy}
          className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-paper-muted"
          title={`Copy ${refString}`}
        >
          <span className="w-3" />
          <span className="font-mono text-ink">{field.name}</span>
          <KindChip kind={field.kind} />
          {field.description && (
            <span className="truncate text-muted-500">{field.description}</span>
          )}
          {copied && <span className="ml-auto text-[10px] text-emerald-700">copied</span>}
        </button>
      )}
    </li>
  );
}

function ArrayItemRow({
  item,
  pathParts,
  refSlug,
}: {
  item: ResponseField;
  pathParts: string[];
  refSlug: string;
}) {
  // Arrays are addressed by numeric index in the executor (e.g. `.0.text`). Show "[0]" as
  // a placeholder so the user knows they can swap it for any index.
  const nextPath = [...pathParts, "0"];
  return (
    <li className="text-xs">
      <div className="flex items-center gap-1.5 rounded px-1 py-0.5 text-muted-500">
        <span className="font-mono">[0]</span>
        <KindChip kind={item.kind} />
        <span className="text-[10px] italic">replace 0 with any index</span>
      </div>
      <ul className="ml-4 grid gap-0.5 border-l border-muted-300/60 pl-2">
        {item.kind === "object" &&
          (item.fields ?? []).map((sub) => (
            <FieldRow key={sub.name} field={sub} pathParts={nextPath} refSlug={refSlug} />
          ))}
        {item.kind !== "object" && (
          <FieldRow field={{ ...item, name: "value" }} pathParts={pathParts} refSlug={refSlug} />
        )}
      </ul>
    </li>
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-3 w-3 shrink-0 text-muted-500 transition-transform duration-150 group-open:rotate-90"
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

function KindChip({ kind }: { kind: string }) {
  return (
    <span className="rounded bg-paper-muted px-1 py-0 font-mono text-[9px] uppercase tracking-wide text-muted-700">
      {kind}
    </span>
  );
}
