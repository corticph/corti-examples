/** Agent library management UI for the second-pass agent details card. */
import { Copy, Download, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, downloadJson } from "../_shared/utils";
import {
  type AgentEntry,
  type AgentOrigin,
  agentOrigin,
  agentStore,
  removeAgentEntry,
  saveAgentEntry,
  toExportAgents,
  useAgentLibrary,
} from "./agent";

interface AgentDraft {
  name: string;
  prompt: string;
}

const EMPTY_DRAFT: AgentDraft = { name: "", prompt: "" };

const NEW_DRAFT_TARGET = "\0new";

const toDraft = (item: AgentEntry): AgentDraft => ({
  name: item.name,
  prompt: item.prompt,
});

const draftEquals = (a: AgentDraft, b: AgentDraft) => a.name === b.name && a.prompt === b.prompt;

export function AgentLibraryEditor() {
  const agents = useAgentLibrary();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<AgentDraft>(EMPTY_DRAFT);
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<AgentEntry | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (creating) {
      titleRef.current?.focus();
    }
  }, [creating]);

  const selected = creating ? null : (agents.find((a) => a.id === selectedId) ?? agents[0] ?? null);

  const target = creating ? NEW_DRAFT_TARGET : (selected?.id ?? null);
  if (draftFor !== target) {
    setDraftFor(target);
    setDraft(creating ? { name: "", prompt: "" } : selected ? toDraft(selected) : EMPTY_DRAFT);
  }

  const dirty = creating || !selected || !draftEquals(draft, toDraft(selected));
  const valid = !!draft.name.trim() && !!draft.prompt.trim();
  const editable = creating || !!selected;

  const save = () => {
    const id = creating ? agentStore.newId() : (selected?.id ?? agentStore.newId());
    saveAgentEntry({
      id,
      name: draft.name.trim(),
      prompt: draft.prompt.trim(),
    });
    if (creating) {
      setCreating(false);
      setSelectedId(id);
    }
  };

  const revert = () => {
    if (creating) {
      setCreating(false);
      return;
    }
    if (selected) {
      setDraft(toDraft(selected));
    }
  };

  const duplicate = (item: AgentEntry) => {
    saveAgentEntry({
      id: agentStore.newId(),
      name: `${item.name} (copy)`,
      prompt: item.prompt,
    });
  };

  const confirmRemove = () => {
    if (pendingRemoval) {
      if (selectedId === pendingRemoval.id) {
        setSelectedId(null);
      }
      removeAgentEntry(pendingRemoval.id);
    }
    setPendingRemoval(null);
  };

  const selectedOrigin: AgentOrigin | null = selected ? agentOrigin(selected) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
          }}
        >
          <Plus className="h-4 w-4" /> New agent
        </Button>
        {agents.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadJson("corti-second-pass-agents.json", toExportAgents(agents))}
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        )}
      </div>

      {editable && (
        <div
          className={cn(
            "flex flex-col gap-2 rounded-md border bg-background p-3",
            creating ? "border-corti-lime ring-1 ring-corti-lime/40" : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {creating ? "New agent" : `Editing "${selected?.name}"`}
            </span>
            {!creating && selectedOrigin === "builtin" && (
              <span className="text-[10px] uppercase text-muted-foreground">
                built-in — saving keeps your copy
              </span>
            )}
            {!creating && selectedOrigin === "edited" && (
              <span className="text-[10px] uppercase text-muted-foreground">edited built-in</span>
            )}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Name
            </span>
            <input
              ref={titleRef}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Discharge summary"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-corti-lime"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              System prompt
            </span>
            <textarea
              value={draft.prompt}
              rows={12}
              onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
              className="w-full resize-y rounded-md border border-border bg-background p-2 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-corti-lime"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} disabled={!dirty || !valid}>
              {creating ? "Add agent" : "Save agent"}
            </Button>
            {dirty && (
              <Button size="sm" variant="ghost" onClick={revert}>
                {creating ? "Cancel" : "Discard changes"}
              </Button>
            )}
            {selectedOrigin === "edited" && !dirty && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => selected && removeAgentEntry(selected.id)}
              >
                Reset to built-in
              </Button>
            )}
          </div>
        </div>
      )}

      <ul className="flex max-h-64 flex-col gap-1 overflow-auto">
        {agents.length === 0 && (
          <li className="px-1 py-2 text-sm text-muted-foreground">No agents yet.</li>
        )}
        {agents.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setSelectedId(item.id);
              }}
              className={cn(
                "min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-sm transition-colors",
                item.id === selected?.id
                  ? "bg-accent text-foreground ring-1 ring-inset ring-corti-lime/60"
                  : "text-foreground hover:bg-accent/50",
              )}
            >
              {item.name}
            </button>
            <button
              type="button"
              onClick={() => duplicate(item)}
              aria-label={`Duplicate ${item.name}`}
              className="shrink-0 rounded border border-border p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Copy className="h-3 w-3" />
            </button>
            {agentOrigin(item) !== "builtin" && (
              <button
                type="button"
                onClick={() => setPendingRemoval(item)}
                aria-label={`Remove ${item.name}`}
                className="shrink-0 rounded border border-border p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={!!pendingRemoval} onOpenChange={(open) => !open && setPendingRemoval(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingRemoval && agentOrigin(pendingRemoval) === "edited"
                ? "Reset agent?"
                : "Remove agent?"}
            </DialogTitle>
            <DialogDescription>
              {pendingRemoval && agentOrigin(pendingRemoval) === "edited"
                ? `This discards your edits to "${pendingRemoval.name}" and restores the built-in agent.`
                : `This removes "${pendingRemoval?.name}". This can't be undone — export first if you want a copy.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingRemoval(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemove}>
              {pendingRemoval && agentOrigin(pendingRemoval) === "edited" ? "Reset" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
