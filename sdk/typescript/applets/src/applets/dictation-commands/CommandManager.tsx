/**
 * Command manager (details card for the dictation-commands applet).
 *
 * Phase 1a: view the configured command catalog (phrases, variables, action) and
 * a live debugger of detected commands + the action executed. Create/edit and
 * wildcard support arrive in 1b / 1c.
 */
import { useEffect, useState } from "react";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "../_shared/utils";
import {
  describeSequence,
  type CommandAction,
} from "../_shared/command-dispatch";
import {
  useCommandStore,
  clearLog,
  upsertCommand,
  removeCommands,
} from "./command-store";
import type { ManagedCommand } from "./command-model";
import { CommandEditor } from "./CommandEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/** Download selected commands as a shareable JSON config object. */
function downloadCommands(commands: ManagedCommand[]) {
  const payload = {
    commands: commands.map(({ builtin: _builtin, ...rest }) => rest),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "corti-commands.json";
  a.click();
  URL.revokeObjectURL(url);
}

function actionSummary(action: CommandAction): string {
  switch (action.kind) {
    case "insert_text":
      return `Insert text: “${action.text.replace(/\n/g, "⏎")}”`;
    case "keypress":
      return `Keystrokes: ${describeSequence(action.combos)}`;
    case "script":
      return "Run script";
    case "delete_last":
      return "Delete last segment";
    case "new_paragraph":
      return "Insert paragraph break";
    case "capitalize_last":
      return "Capitalize last segment";
    case "insert_template":
      return `Insert template ({${action.variableKey}})`;
    case "select_enum":
      return `Select range ({${action.variableKey}})`;
    case "select_wildcard":
      return `Select spoken text ({${action.variableKey}})`;
    case "format":
      return `Format selection ({${action.variableKey}})`;
    case "noop":
      return action.note ?? "No editor action";
  }
}

type Mode = { kind: "view" } | { kind: "new" } | { kind: "edit"; id: string };

export function CommandManager() {
  const { commands, log } = useCommandStore();
  const [selectedId, setSelectedId] = useState(commands[0]?.id);
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const selected = commands.find((c) => c.id === selectedId) ?? commands[0];
  const editing =
    mode.kind === "edit" ? commands.find((c) => c.id === mode.id) : undefined;

  const checkedCommands = commands.filter((c) => checked.has(c.id));
  const removableChecked = checkedCommands.filter((c) => !c.builtin);

  const toggleChecked = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  useEffect(() => {
    if (!selectedId && commands[0]?.id) {
      setSelectedId(commands[0].id);
      return;
    }
    if (selectedId && !commands.some((command) => command.id === selectedId)) {
      setSelectedId(commands[0]?.id);
    }
  }, [commands, selectedId]);

  const confirmRemove = () => {
    removeCommands(removableChecked.map((c) => c.id));
    setChecked(new Set());
    setConfirmOpen(false);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Monitor: detected commands + executed action */}
      <div className="rounded-md border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Command monitor
          </p>
          {log.length > 0 && (
            <button
              type="button"
              onClick={clearLog}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
        {log.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            Detected commands and the action executed will appear here.
          </p>
        ) : (
          <ul className="max-h-48 divide-y divide-border overflow-auto">
            {log.map((entry, i) => (
              <li
                key={`${entry.at}-${i}`}
                className="flex items-baseline gap-2 px-3 py-1.5 text-xs"
              >
                <code className="shrink-0 font-semibold text-foreground">
                  {entry.id}
                </code>
                {entry.variables && Object.keys(entry.variables).length > 0 && (
                  <code className="shrink-0 text-muted-foreground">
                    {JSON.stringify(entry.variables)}
                  </code>
                )}
                <span className="truncate text-foreground">
                  {entry.description}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-5 md:flex-row">
        <div className="flex shrink-0 flex-col gap-2 md:w-75">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMode({ kind: "new" })}
            >
              <Plus className="h-4 w-4" /> New command
            </Button>
            {mode.kind === "view" && selected && !selected.builtin && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMode({ kind: "edit", id: selected.id })}
              >
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
          </div>

          {checked.size > 0 && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => downloadCommands(checkedCommands)}
              >
                <Download className="h-4 w-4" /> Export ({checked.size})
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={removableChecked.length === 0}
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4" />({removableChecked.length})
              </Button>
            </div>
          )}

          <ul className="flex max-h-72 flex-col gap-1 overflow-auto">
            {commands.map((command) => (
              <li key={command.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checked.has(command.id)}
                  onChange={() => toggleChecked(command.id)}
                  aria-label={`Select ${command.id}`}
                  className="shrink-0 accent-corti-lime"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(command.id);
                    setMode({ kind: "view" });
                  }}
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                    command.id === selectedId && mode.kind === "view"
                      ? "bg-accent font-medium text-foreground ring-1 ring-inset ring-corti-lime/60"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <code className="text-xs">{command.id}</code>
                  {!command.builtin && (
                    <span className="ml-1 rounded bg-corti-lime/20 px-1 text-[10px] uppercase text-foreground">
                      custom
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {mode.kind !== "view" ? (
          <CommandEditor
            command={editing}
            existingIds={commands.map((c) => c.id)}
            onSave={(command) => {
              upsertCommand(command);
              setSelectedId(command.id);
              setMode({ kind: "view" });
            }}
            onCancel={() => setMode({ kind: "view" })}
          />
        ) : (
          selected && (
            <div className="min-w-0 flex-1 rounded-md border border-border bg-background p-3">
              {selected.description && (
                <p className="mb-2 text-sm text-foreground">
                  {selected.description}
                </p>
              )}

              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Phrases
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {selected.phrases.map((phrase) => (
                  <li
                    key={phrase}
                    className="rounded bg-muted px-2 py-0.5 text-xs text-foreground"
                  >
                    “{phrase}”
                  </li>
                ))}
              </ul>

              {selected.variables && selected.variables.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Variables
                  </p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {selected.variables.map((variable) => (
                      <li
                        key={variable.key}
                        className="text-sm text-foreground"
                      >
                        <code className="text-xs">{variable.key}</code>{" "}
                        <span className="text-xs text-muted-foreground">
                          ({variable.type})
                        </span>
                        {variable.type === "enum" && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            — {variable.enum.join(", ")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Action
                </p>
                <p className="mt-1 text-sm text-foreground">
                  {actionSummary(selected.action)}
                </p>
              </div>
            </div>
          )
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove commands?</DialogTitle>
            <DialogDescription>
              This removes {removableChecked.length} custom command
              {removableChecked.length === 1 ? "" : "s"}
              {checkedCommands.length > removableChecked.length
                ? ` (built-in commands stay).`
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
