/**
 * Generic manager for a list of simple string-field "rules" (replacements,
 * terms, …). Mirrors the dictation-commands manager: multiselect to export
 * (download JSON) or remove (with a confirmation dialog; built-in catalog rules
 * are protected), plus an inline create/edit form. Configured per applet via
 * `fields` + `describe` + `toExport`.
 */
import { useEffect, useState } from "react";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "./utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { RuleBase } from "./rule-store";

export interface RuleField {
  name: string;
  label: string;
  placeholder: string;
}

interface RuleManagerProps<T extends RuleBase> {
  items: T[];
  fields: RuleField[];
  /** Row label for a rule. */
  describe: (item: T) => string;
  /** Build the JSON payload to download for the given rules. */
  toExport: (items: T[]) => unknown;
  exportFilename: string;
  /** Singular noun, e.g. "replacement" / "term". */
  noun: string;
  onUpsert: (item: T) => void;
  onRemoveMany: (ids: string[]) => void;
  newId: () => string;
}

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Mode = { kind: "list" } | { kind: "new" } | { kind: "edit"; id: string };

export function RuleManager<T extends RuleBase>({
  items,
  fields,
  describe,
  toExport,
  exportFilename,
  noun,
  onUpsert,
  onRemoveMany,
  newId,
}: RuleManagerProps<T>) {
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState(items[0]?.id);

  const checkedItems = items.filter((i) => checked.has(i.id));
  const removable = checkedItems.filter((i) => !i.builtin);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  useEffect(() => {
    if (!selectedId && items[0]?.id) {
      setSelectedId(items[0].id);
      return;
    }
    if (selectedId && !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]?.id);
    }
  }, [items, selectedId]);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const openNew = () => {
    setDraft(Object.fromEntries(fields.map((f) => [f.name, ""])));
    setMode({ kind: "new" });
  };
  const openEdit = (item: T) => {
    setDraft(
      Object.fromEntries(
        fields.map((f) => [f.name, String((item as any)[f.name] ?? "")]),
      ),
    );
    setMode({ kind: "edit", id: item.id });
  };

  const draftValid = fields.every((f) => draft[f.name]?.trim());

  const save = () => {
    const values = Object.fromEntries(
      fields.map((f) => [f.name, draft[f.name].trim()]),
    );
    const id = mode.kind === "edit" ? mode.id : newId();
    onUpsert({ id, builtin: false, ...values } as unknown as T);
    setMode({ kind: "list" });
  };

  const confirmRemove = () => {
    onRemoveMany(removable.map((i) => i.id));
    setChecked(new Set());
    setConfirmOpen(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={openNew}>
          <Plus className="h-4 w-4" /> New {noun}
        </Button>
        {mode.kind === "list" && selected && !selected.builtin && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => openEdit(selected)}
          >
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )}
        {checked.size > 0 && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => download(exportFilename, toExport(checkedItems))}
            >
              <Download className="h-4 w-4" /> Export ({checked.size})
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={removable.length === 0}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> Remove ({removable.length})
            </Button>
          </>
        )}
      </div>

      {mode.kind !== "list" && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
          {fields.map((f) => (
            <label key={f.name} className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {f.label}
              </span>
              <input
                value={draft[f.name] ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [f.name]: e.target.value }))
                }
                placeholder={f.placeholder}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-corti-lime"
              />
            </label>
          ))}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={!draftValid}>
              {mode.kind === "edit" ? "Save" : `Add ${noun}`}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMode({ kind: "list" })}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <ul className="flex max-h-72 flex-col gap-1 overflow-auto">
        {items.length === 0 && (
          <li className="px-1 py-2 text-sm text-muted-foreground">
            No {noun}s yet.
          </li>
        )}
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={checked.has(item.id)}
              onChange={() => toggle(item.id)}
              aria-label={`Select ${describe(item)}`}
              className="shrink-0 accent-corti-lime"
            />
            <button
              type="button"
              onClick={() => setSelectedId(item.id)}
              className={cn(
                "flex-1 truncate rounded-md px-2 py-1 text-left text-sm transition-colors",
                item.id === selected?.id && mode.kind === "list"
                  ? "bg-accent text-foreground ring-1 ring-inset ring-corti-lime/60"
                  : "text-foreground hover:bg-accent/50",
              )}
            >
              {describe(item)}
              {!item.builtin && (
                <span className="ml-1 rounded bg-corti-lime/20 px-1 text-[10px] uppercase">
                  custom
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {noun}s?</DialogTitle>
            <DialogDescription>
              This removes {removable.length} custom {noun}
              {removable.length === 1 ? "" : "s"}
              {checkedItems.length > removable.length
                ? " (built-in entries stay)."
                : "."}{" "}
              This can’t be undone — export first if you want a copy.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemove}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
