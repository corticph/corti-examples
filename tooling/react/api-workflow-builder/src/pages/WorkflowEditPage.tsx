import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "@xyflow/react/dist/style.css";
import { EndpointPicker } from "../components/EndpointPicker";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Pill } from "../components/ui/Pill";
import { useProfiles } from "../context/ProfilesContext";
import { endpointById, endpointGroups } from "../endpoints/registry";
import type { FormValues } from "../endpoints/types";
import { emptyValuesFor } from "../endpoints/types";
import { useWorkflows } from "../workflows/context";
import { EndpointNode, type EndpointNodeData } from "../workflows/EndpointNode";
import { copyText, formatErrorForCopy } from "../workflows/errors";
import { runWorkflow } from "../workflows/executor";
import { buildHistoryEntry, type HistoryEntry, saveHistoryEntry } from "../workflows/history";
import { NodeEditor } from "../workflows/NodeEditor";
import { type Ask, PreRunModal, type PreRunValues } from "../workflows/PreRunModal";
import { RunHistoryModal } from "../workflows/RunHistoryModal";
import { generateRef, getUpstreamNodes } from "../workflows/refs";
import { applyAsks, gatherAsks } from "../workflows/runtimeInputs";
import {
  type StreamAggregate,
  StreamRunModal,
  type StreamsNodeConfig,
} from "../workflows/StreamRunModal";
import type { NodeErrorDetail, NodeResult, Workflow, WorkflowNode } from "../workflows/types";

// Local shape matching what runWorkflow returns + what we synthesize on partial runs.
// We accept either since both paths go through saveRunToHistory.
type WorkflowRunLike = {
  startedAt: string;
  finishedAt?: string;
  nodeResults: Record<string, NodeResult>;
  nodeSentValues?: Record<string, FormValues>;
  nodeFileNames?: Record<string, Record<string, string>>;
};

const nodeTypes = { endpoint: EndpointNode };

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

type FlowNode = Node<EndpointNodeData>;

function toFlowNode(
  n: WorkflowNode,
  statuses: Record<string, EndpointNodeData["status"]>,
  results: Record<string, NodeResult>,
): FlowNode {
  return {
    id: n.id,
    type: "endpoint",
    position: n.position,
    data: {
      endpointId: n.endpointId,
      label: n.label,
      status: statuses[n.id] ?? "idle",
      result: results[n.id],
    },
  };
}

export function WorkflowEditPage() {
  // The inner page calls `useReactFlow()` from the sidebar (outside the <ReactFlow> tree)
  // to compute screen→flow coordinates for new-node placement. That hook requires this
  // provider to exist above it; without the wrap it throws.
  return (
    <ReactFlowProvider>
      <WorkflowEditPageInner />
    </ReactFlowProvider>
  );
}

function WorkflowEditPageInner() {
  const { id } = useParams<{ id: string }>();
  const { getById, update } = useWorkflows();
  const { active, ensureToken } = useProfiles();
  const { screenToFlowPosition } = useReactFlow();
  // Ref on the div that hosts the ReactFlow canvas. We grab its bounding rect at add-time
  // to figure out the screen-space center of the visible canvas.
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);

  const workflow = id ? getById(id) : undefined;

  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<{ summary: string; detail: NodeErrorDetail } | null>(
    null,
  );
  // Pending asks for the pre-run modal. Set when the user clicks Run and there are
  // runtime inputs to collect; cleared when the modal closes (cancel or submit).
  const [pendingAsks, setPendingAsks] = useState<Ask[] | null>(null);
  // Active stream call from the executor's onWss hook. Holds the resolve/reject handles
  // so the modal can hand the aggregate back to the paused executor. Null when no WSS
  // node is currently waiting on input.
  const [activeStreamCall, setActiveStreamCall] = useState<{
    node: WorkflowNode;
    config: StreamsNodeConfig;
    interactionId: string;
    resolve: (aggregate: StreamAggregate) => void;
    reject: (err: Error) => void;
  } | null>(null);
  // Run history modal: open flag + a refresh counter so the modal re-reads from
  // localStorage whenever a new run finishes (which writes to localStorage but doesn't
  // trigger any React render on its own).
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, EndpointNodeData["status"]>>({});
  const [nodeResults, setNodeResults] = useState<Record<string, NodeResult>>({});
  const filesRef = useRef<Record<string, File>>({}); // keyed `${nodeId}.${fieldName}`

  // Initialise from workflow
  useEffect(() => {
    if (!workflow) return;
    setName(workflow.name);
    setNodes(workflow.nodes.map((n) => toFlowNode(n, {}, {})));
    setEdges(
      workflow.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: false,
      })),
    );
    setNodeStatuses({});
    setNodeResults({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Re-render data when statuses/results update
  useEffect(() => {
    setNodes((cur) =>
      cur.map((n) => ({
        ...n,
        data: {
          ...n.data,
          status: nodeStatuses[n.id] ?? "idle",
          result: nodeResults[n.id],
        },
      })),
    );
  }, [nodeStatuses, nodeResults]);

  // Persistence: derive Workflow shape from local state and push updates on debounce
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!workflow) return;
    if (!dirtyRef.current) return;
    const t = setTimeout(() => {
      const next: Partial<Workflow> = {
        name,
        nodes: nodes.map((n) => {
          const orig = workflow.nodes.find((x) => x.id === n.id);
          return {
            id: n.id,
            ref: orig?.ref, // keep the slug so {{ref.field}} substitution remains stable
            endpointId: n.data.endpointId,
            label: n.data.label,
            position: n.position,
            values:
              orig?.values ??
              emptyValuesFor({
                id: "",
                group: "",
                method: "GET",
                path: "",
                label: "",
                description: "",
              } as any),
            runtimeFields: orig?.runtimeFields, // keep "ask at run time" flags through debounce
            autoGenerateFields: orig?.autoGenerateFields, // and the "auto-uuid" flags
          };
        }),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source as string,
          target: e.target as string,
        })),
      };
      update(workflow.id, next);
      dirtyRef.current = false;
    }, 300);
    return () => clearTimeout(t);
  }, [name, nodes, edges, workflow, update]);

  function markDirty() {
    dirtyRef.current = true;
  }

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds) as FlowNode[]);
    markDirty();
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
    markDirty();
  }, []);
  const onConnect = useCallback((conn: Connection) => {
    setEdges((eds) => addEdge({ ...conn, id: uid() }, eds));
    markDirty();
  }, []);
  // Right-click an edge to remove it. Backspace/Delete after selecting the edge
  // still works (ReactFlow default), but most users reach for the right mouse button
  // first — this avoids the "is this even removable?" feeling.
  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    markDirty();
  }, []);

  function addNode(endpointId: string) {
    if (!workflow) return;
    const nodeId = uid();
    const existingRefs = workflow.nodes.map((n) => n.ref).filter((r): r is string => !!r);

    // Place the new node at the center of the *visible* canvas so it doesn't spawn
    // off-screen when the user has panned/zoomed. Falls back to the old cascading offset
    // if we haven't been able to measure the canvas yet (very early render).
    let position: { x: number; y: number };
    const wrapper = canvasWrapperRef.current;
    if (wrapper) {
      const rect = wrapper.getBoundingClientRect();
      const center = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      // Small cascading offset so successive adds at the same view don't stack pixel-perfect.
      const stack = workflow.nodes.length % 6;
      position = { x: center.x - 120 + stack * 24, y: center.y - 40 + stack * 24 };
    } else {
      const offset = workflow.nodes.length * 40;
      position = { x: 80 + offset, y: 80 + offset };
    }

    const newNode: WorkflowNode = {
      id: nodeId,
      ref: generateRef(endpointId, existingRefs),
      endpointId,
      position,
      values: emptyValuesFor({ id: endpointId } as any),
    };
    const endpoint = endpointGroups.flatMap((g) => g.endpoints).find((e) => e.id === endpointId);
    if (endpoint) newNode.values = emptyValuesFor(endpoint);

    const nextWorkflow: Workflow = { ...workflow, nodes: [...workflow.nodes, newNode] };
    update(workflow.id, { nodes: nextWorkflow.nodes });
    setNodes((cur) => [...cur, toFlowNode(newNode, nodeStatuses, nodeResults)]);
    setSelectedId(nodeId);
  }

  function removeNode(nodeId: string) {
    if (!workflow) return;
    const nextNodes = workflow.nodes.filter((n) => n.id !== nodeId);
    const nextEdges = workflow.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
    update(workflow.id, { nodes: nextNodes, edges: nextEdges });
    setNodes((cur) => cur.filter((n) => n.id !== nodeId));
    setEdges((cur) => cur.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedId === nodeId) setSelectedId(null);
  }

  function updateNode(nodeId: string, patch: Partial<WorkflowNode>) {
    if (!workflow) return;
    const nextNodes = workflow.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n));
    update(workflow.id, { nodes: nextNodes });
    if (patch.label !== undefined) {
      setNodes((cur) =>
        cur.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, label: patch.label } } : n)),
      );
    }
  }

  function startRun() {
    if (!workflow || !active) return;
    setRunError(null);
    // WSS nodes can sit anywhere in the workflow — the executor pauses on them via the
    // onWss hook and the modal handles the live recording. So no pre-flight check.
    const asks = gatherAsks(workflow, filesRef.current, endpointById);
    if (asks.length > 0) {
      setPendingAsks(asks);
      return;
    }
    void executeRun({ ...workflow, name });
  }

  async function onSubmitAsks(values: PreRunValues) {
    if (!workflow || !pendingAsks) return;
    const snapshot = applyAsks({ ...workflow, name }, pendingAsks, values, filesRef.current);
    setPendingAsks(null);
    void executeRun(snapshot);
  }

  async function executeRun(snapshot: Workflow) {
    if (!active) return;
    setRunError(null);
    setRunning(true);
    setNodeStatuses({});
    setNodeResults({});
    // Mirror of nodeResults in a local map, populated as onNodeFinish fires. Used so the
    // catch-path history save still has the partial per-node results when the run aborts
    // halfway through (React state isn't readable here — closure capture is stale).
    const partialResults: Record<string, NodeResult> = {};
    const runStartedAt = new Date().toISOString();
    let runCancelled = false;
    let runError: string | undefined;
    try {
      const token = await ensureToken(active.id);
      const run = await runWorkflow(snapshot, {
        profile: active,
        token,
        files: filesRef.current,
        onNodeStart: (nodeId) => setNodeStatuses((cur) => ({ ...cur, [nodeId]: "running" })),
        onNodeFinish: (nodeId, result) => {
          partialResults[nodeId] = result;
          setNodeStatuses((cur) => ({ ...cur, [nodeId]: result.error ? "error" : "ok" }));
          setNodeResults((cur) => ({ ...cur, [nodeId]: result }));
        },
        // Executor pauses here when it hits a WSS node. We open StreamRunModal and
        // resolve when the user clicks "Run workflow with this output" in the modal.
        // Upstream values (e.g. {{create_interaction_1.interactionId}}) are already
        // substituted into `substitutedValues.path.id` by the executor.
        onWss: async ({ node, substitutedValues }) => {
          const interactionId = substitutedValues.path?.id ?? "";
          if (!interactionId) {
            throw new Error(
              `Stream node "${node.ref ?? node.id}" has no interaction id at run time. ` +
                `Set path.id in the edit panel, or wire {{create_interaction_X.interactionId}} from an upstream node.`,
            );
          }
          const config = parseStreamsConfig(node);
          const aggregate = await new Promise<StreamAggregate>((resolve, reject) => {
            setActiveStreamCall({ node, config, interactionId, resolve, reject });
          });
          return {
            status: 200,
            body: aggregate,
            durationMs: aggregate.durationMs,
          };
        },
      });
      // Save run history on the success path. "Completed" here means the executor
      // ran to the end without throwing — individual nodes might have errored, which
      // we surface in the status separately via their NodeResult.
      const anyNodeError = Object.values(run.nodeResults).some((r) => !!r.error);
      saveRunToHistory(
        snapshot,
        run,
        anyNodeError ? "error" : "completed",
        anyNodeError ? Object.values(run.nodeResults).find((r) => r.error)?.error : undefined,
      );
    } catch (e: any) {
      // Cancellation (user closed the stream modal) produces an Error with a specific
      // message — treat that as "cancelled" in history, everything else as "error".
      runCancelled = typeof e?.message === "string" && e.message.startsWith("Stream cancelled");
      const message: string = typeof e?.message === "string" ? e.message : String(e);
      runError = message;
      const detail: NodeErrorDetail = {
        timestamp: new Date().toISOString(),
        name: e?.name ?? "Error",
        message,
        stack: typeof e?.stack === "string" ? e.stack : undefined,
      };
      setRunError({ summary: message, detail });
      // Save the partial run — failed runs are often the most useful history rows.
      // partialResults was populated by onNodeFinish callbacks before the throw.
      const partial = {
        startedAt: runStartedAt,
        finishedAt: new Date().toISOString(),
        nodeResults: partialResults,
      };
      saveRunToHistory(snapshot, partial, runCancelled ? "cancelled" : "error", runError);
    } finally {
      setRunning(false);
    }
  }

  function saveRunToHistory(
    snapshot: Workflow,
    run: WorkflowRunLike,
    status: HistoryEntry["status"],
    errorSummary?: string,
  ) {
    const nodeMeta = Object.fromEntries(
      snapshot.nodes.map((n) => {
        const endpoint = endpointById[n.endpointId];
        return [
          n.id,
          {
            ref: n.ref,
            label: n.label,
            endpointId: n.endpointId,
            method: endpoint?.method ?? "?",
          },
        ];
      }),
    );
    const entry = buildHistoryEntry({
      workflowId: snapshot.id,
      workflowName: snapshot.name,
      run,
      nodeMeta,
      status,
      errorSummary,
    });
    saveHistoryEntry(entry);
    // Force the history modal (if open) to re-read by bumping a small refresh counter.
    setHistoryRefresh((n) => n + 1);
  }

  /**
   * Pull the parsed streams config out of a WSS node's body JSON. The body schema
   * gives us a friendly form UX; this is the runtime extraction for StreamRunModal.
   */
  function parseStreamsConfig(node: WorkflowNode): StreamsNodeConfig {
    const raw = typeof node.values.body === "string" ? node.values.body : "";
    if (!raw.trim()) return {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as StreamsNodeConfig;
      }
    } catch {
      /* fall through */
    }
    return {};
  }

  if (!workflow) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="rounded-lg border border-muted-300/60 bg-paper p-6 text-sm">
          Workflow not found.{" "}
          <Link to="/workflows" className="underline">
            Back to workflows
          </Link>
          .
        </div>
      </div>
    );
  }

  const selectedNode = workflow.nodes.find((n) => n.id === selectedId);

  // Full-bleed layout: Add-node sidebar pinned to the left screen edge, canvas takes all the
  // remaining width, Edit-node panel collapses to below the canvas (or to a thin tab when no
  // node is selected) so the canvas gets every available pixel.
  //
  // Vertical sizing: the TopBar above us is ~57px; the rest fills the viewport.
  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden bg-paper-muted">
      {/* LEFT SIDEBAR — Add node. Pinned to the left edge of the viewport, full height,
          no rounded corners or margin — same treatment as the EndpointsLayout sidebar. */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-muted-300/40 bg-paper">
        <div className="border-b border-muted-300/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-500">
          Add node
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <EndpointPicker onPick={addNode} storageKey="workflows.addnode.expanded" />
        </div>
      </aside>

      {/* RIGHT COLUMN — header, canvas, then edit panel below canvas. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header — sits above the canvas, padded so it doesn't hug the screen edge. */}
        <header className="flex flex-wrap items-center gap-3 border-b border-muted-300/40 bg-paper px-5 py-3">
          <div className="text-sm text-muted-500">
            <Link to="/workflows" className="hover:underline">
              ← Workflows
            </Link>
          </div>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              markDirty();
            }}
            className="max-w-md text-lg font-semibold"
          />
          <div className="grow" />
          {runError && <RunErrorPill error={runError} onDismiss={() => setRunError(null)} />}
          <button
            onClick={() => setHistoryOpen(true)}
            className="rounded-lg border border-muted-300 bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper-muted"
            title="View past runs of this workflow"
          >
            History
          </button>
          <Button onClick={startRun} disabled={running || !active || workflow.nodes.length === 0}>
            {running ? "Running…" : "Run workflow"}
          </Button>
        </header>

        {/* CANVAS — takes all remaining vertical space minus the edit panel below.
            Setting min-h-0 + flex-1 lets the ReactFlow div size itself correctly. */}
        <div ref={canvasWrapperRef} className="relative min-h-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeContextMenu={onEdgeContextMenu}
            onSelectionChange={(s) => setSelectedId((s.nodes[0]?.id as string) ?? null)}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {/* EDIT NODE PANEL — sits BELOW the canvas. Tall enough to show params/headers/body
            without scrolling on most screens, but capped so the canvas always gets the larger
            share of vertical space. When no node is selected, collapses to a compact hint
            strip so the canvas grows to fill the space. */}
        <div
          className={`flex shrink-0 flex-col border-t border-muted-300/40 bg-paper ${
            selectedNode ? "h-[42vh]" : "h-12"
          }`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-muted-300/40 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-500">
            <span>{selectedNode ? "Edit node" : "Edit"}</span>
            {!selectedNode && (
              <span className="font-normal normal-case tracking-normal text-muted-500">
                Select a node on the canvas to edit it.
              </span>
            )}
          </div>
          {selectedNode && (
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <NodeEditor
                node={selectedNode}
                upstreamNodes={getUpstreamNodes(selectedNode.id, workflow.edges, workflow.nodes)}
                onChange={(patch) => updateNode(selectedNode.id, patch)}
                onRemove={() => removeNode(selectedNode.id)}
                files={Object.fromEntries(
                  Object.entries(filesRef.current)
                    .filter(([k]) => k.startsWith(`${selectedNode.id}.`))
                    .map(([k, v]) => [k.slice(selectedNode.id.length + 1), v]),
                )}
                onFile={(fieldName, file) => {
                  const key = `${selectedNode.id}.${fieldName}`;
                  if (file) filesRef.current[key] = file;
                  else delete filesRef.current[key];
                  // Force a re-render so the file display updates.
                  setNodes((cur) => [...cur]);
                }}
              />
            </div>
          )}
        </div>
      </div>

      <PreRunModal
        open={pendingAsks !== null}
        asks={pendingAsks ?? []}
        onCancel={() => setPendingAsks(null)}
        onRun={onSubmitAsks}
      />

      {activeStreamCall && active && (
        <StreamRunModal
          open
          interactionId={activeStreamCall.interactionId}
          config={activeStreamCall.config}
          profile={active}
          ensureToken={ensureToken}
          onCancel={() => {
            // Reject the paused executor so the workflow aborts cleanly with this error.
            activeStreamCall.reject(new Error("Stream cancelled by user."));
            setActiveStreamCall(null);
          }}
          onComplete={(aggregate) => {
            // Resolve the paused executor so downstream REST nodes pick up where they left off.
            activeStreamCall.resolve(aggregate);
            setActiveStreamCall(null);
          }}
        />
      )}

      <RunHistoryModal
        open={historyOpen}
        workflowId={workflow.id}
        refreshToken={historyRefresh}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}

// Top-level run error surfaces in the page header. Same Copy + Details treatment as the
// per-node error block, just positioned inline with the run button.
function RunErrorPill({
  error,
  onDismiss,
}: {
  error: { summary: string; detail: NodeErrorDetail };
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const blob = formatErrorForCopy(error.detail);
  async function handleCopy() {
    const ok = await copyText(blob);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  }
  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-900">
        <span className="font-medium">{error.summary}</span>
        <button
          onClick={handleCopy}
          className="rounded border border-red-300 bg-paper px-1.5 py-0.5 text-[10px] font-medium hover:bg-red-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded border border-red-300 bg-paper px-1.5 py-0.5 text-[10px] font-medium hover:bg-red-100"
        >
          {open ? "Hide" : "Details"}
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="ml-0.5 text-red-700 hover:text-red-900"
        >
          ×
        </button>
      </div>
      {open && (
        <pre className="absolute right-0 top-full z-50 mt-1 max-h-[60vh] w-[640px] max-w-[90vw] overflow-auto rounded-md border border-muted-300/60 bg-ink p-3 text-[11px] leading-tight text-paper shadow-card">
          {blob}
        </pre>
      )}
    </div>
  );
}
