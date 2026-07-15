import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { useWorkflows } from "../workflows/context";
import { copyText } from "../workflows/errors";

export function WorkflowsListPage() {
  const { workflows, create, remove } = useWorkflows();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [exportCopied, setExportCopied] = useState(false);
  const navigate = useNavigate();

  function submit() {
    if (!name.trim()) return;
    const wf = create({ name: name.trim() });
    setOpen(false);
    setName("");
    navigate(`/workflows/${wf.id}`);
  }

  async function exportAll() {
    const json = JSON.stringify(workflows, null, 2);
    const ok = await copyText(json);
    if (ok) {
      setExportCopied(true);
      window.setTimeout(() => setExportCopied(false), 1500);
    }
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="mt-1 text-sm text-muted-700">
            Chain endpoints together visually. Pipe outputs of one node into inputs of the next.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {workflows.length > 0 && (
            <button
              onClick={exportAll}
              title="Copy all workflows as JSON — useful for backups, sharing with a teammate, or seeding defaults."
              className="rounded-lg border border-muted-300 bg-paper px-3 py-2 text-sm font-medium text-ink hover:bg-paper-muted"
            >
              {exportCopied ? "Copied" : "Export all"}
            </button>
          )}
          <Button onClick={() => setOpen(true)}>+ New workflow</Button>
        </div>
      </header>

      {workflows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-muted-300 bg-paper p-12 text-center">
          <h2 className="text-lg font-semibold">No workflows yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-700">
            Build one by chaining endpoints — e.g.{" "}
            <em>Create interaction → Upload recording → Create transcript → Generate document</em>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((w) => (
            <Card key={w.id} className="flex flex-col gap-2 p-4">
              <Link to={`/workflows/${w.id}`} className="text-base font-semibold hover:underline">
                {w.name}
              </Link>
              <div className="text-xs text-muted-500">
                {w.nodes.length} node{w.nodes.length === 1 ? "" : "s"} ·{" "}
                {new Date(w.updatedAt).toLocaleString()}
              </div>
              <div className="mt-1 flex gap-2">
                <Link
                  to={`/workflows/${w.id}`}
                  className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink-soft"
                >
                  Open
                </Link>
                <button
                  onClick={() => {
                    if (confirm(`Delete workflow "${w.name}"?`)) remove(w.id);
                  }}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New workflow">
        <div className="grid gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Recorded scribe pipeline"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!name.trim()}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
