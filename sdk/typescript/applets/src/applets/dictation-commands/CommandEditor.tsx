/**
 * Create/edit form for a user-defined command: phrases, variables (enum or
 * wildcard), and an action — "insert predefined text" (text box), "execute
 * keypress" (capture a sequence of keystrokes), or "run script" (JavaScript run
 * when the command fires, with access to the editor + command variables).
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "../_shared/utils";
import { describeSequence, type KeyCombo } from "../_shared/command-dispatch";
import type { ManagedCommand, ManagedVariable } from "./command-model";
import { Button } from "@/components/ui/button";

interface DraftVariable {
  key: string;
  type: "enum" | "wildcard";
  enumCsv: string;
}

type ActionKind = "insert_text" | "keypress" | "script";

interface Draft {
  id: string;
  phrasesText: string;
  variables: DraftVariable[];
  actionKind: ActionKind;
  insertText: string;
  combos: KeyCombo[];
  code: string;
}

const DEFAULT_SCRIPT = [
  "// Runs when the command is recognized.",
  "// Available: editor (getText/getSelection/setSelection/insert/replaceRange/applyFormat),",
  "// command (server data), variables (its variables). Optionally return a string.",
  "const t = (variables.text || '').trim();",
  "if (!t) return 'no text';",
  "const i = editor.getText().toLowerCase().lastIndexOf(t.toLowerCase());",
  "if (i < 0) return t + ' not found';",
  "editor.setSelection(i, i + t.length);",
  "return 'selected ' + t;",
].join("\n");

function toDraft(command?: ManagedCommand): Draft {
  const base: Draft = {
    id: "",
    phrasesText: "",
    variables: [],
    actionKind: "insert_text",
    insertText: "",
    combos: [],
    code: DEFAULT_SCRIPT,
  };
  if (!command) return base;
  return {
    ...base,
    id: command.id,
    phrasesText: command.phrases.join("\n"),
    variables: (command.variables ?? []).map((v) => ({
      key: v.key,
      type: v.type,
      enumCsv: v.type === "enum" ? v.enum.join(", ") : "",
    })),
    actionKind:
      command.action.kind === "keypress"
        ? "keypress"
        : command.action.kind === "script"
          ? "script"
          : "insert_text",
    insertText:
      command.action.kind === "insert_text" ? command.action.text : "",
    combos: command.action.kind === "keypress" ? command.action.combos : [],
    code:
      command.action.kind === "script" ? command.action.code : DEFAULT_SCRIPT,
  };
}

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

function toKeyCombo(e: Pick<
  KeyboardEvent,
  "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "key"
>): KeyCombo {
  return {
    ctrl: e.ctrlKey,
    meta: e.metaKey,
    alt: e.altKey,
    shift: e.shiftKey,
    key: e.key,
  };
}

/** Capture a sequence of keystrokes until the user stops. */
function KeySequenceCapture({
  combos,
  onChange,
}: {
  combos: KeyCombo[];
  onChange: (c: KeyCombo[]) => void;
}) {
  const [capturing, setCapturing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!capturing) return;
    captureRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (MODIFIER_KEYS.has(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onChange([...combos, toKeyCombo(e)]);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capturing, combos, onChange]);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={captureRef}
        tabIndex={0}
        role="textbox"
        aria-label="Keystroke capture"
        className={cn(
          "min-h-[2.25rem] rounded-md border px-3 py-1.5 text-sm outline-none",
          capturing
            ? "border-corti-lime text-foreground"
            : "border-border text-muted-foreground",
        )}
      >
        {combos.length > 0 ? (
          <span className="font-mono text-foreground">
            {describeSequence(combos)}
          </span>
        ) : capturing ? (
          "Type keys... (modifier combinations are captured together)"
        ) : (
          "No keystrokes captured yet"
        )}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={capturing ? "default" : "outline"}
          onClick={() => setCapturing((c) => !c)}
        >
          {capturing ? "Stop capturing" : "Start capturing"}
        </Button>
        {combos.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onChange([])}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

export function CommandEditor({
  command,
  existingIds,
  onSave,
  onCancel,
}: {
  command?: ManagedCommand;
  existingIds: string[];
  onSave: (command: ManagedCommand) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(command));
  const isEdit = !!command;

  const phrases = draft.phrasesText
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);
  const id = draft.id.trim();
  const idValid = /^[a-zA-Z0-9_-]+$/.test(id);
  const idClash = !isEdit && existingIds.includes(id);
  const actionReady =
    draft.actionKind === "insert_text"
      ? draft.insertText.length > 0
      : draft.actionKind === "keypress"
        ? draft.combos.length > 0
        : draft.code.trim().length > 0;
  const valid = idValid && !idClash && phrases.length > 0 && actionReady;

  // Variables are optional — a command with no {var} phrases needs none.
  const disabledReason = !id
    ? "Enter a command id"
    : !idValid
      ? "Command id: letters, numbers, _ or - (no spaces)"
      : idClash
        ? "That command id is already in use"
        : phrases.length === 0
          ? "Add at least one phrase"
          : !actionReady
            ? draft.actionKind === "insert_text"
              ? "Enter the text to insert"
              : draft.actionKind === "keypress"
                ? "Capture at least one keystroke"
                : "Add script code"
            : "";

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const save = () => {
    const variables: ManagedVariable[] = draft.variables
      .filter((v) => v.key.trim())
      .map((v) =>
        v.type === "wildcard"
          ? { key: v.key.trim(), type: "wildcard" }
          : {
              key: v.key.trim(),
              type: "enum",
              enum: v.enumCsv
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            },
      );
    const action: ManagedCommand["action"] =
      draft.actionKind === "insert_text"
        ? { kind: "insert_text", text: draft.insertText }
        : draft.actionKind === "keypress"
          ? { kind: "keypress", combos: draft.combos }
          : { kind: "script", code: draft.code };
    onSave({
      id: draft.id.trim(),
      phrases,
      variables: variables.length ? variables : undefined,
      action,
      builtin: false,
    });
  };

  return (
    <div className="min-w-0 flex-1 rounded-md border border-border bg-background p-3">
      <div className="flex flex-col gap-3">
        <Field label="Command id">
          <input
            value={draft.id}
            disabled={isEdit}
            onChange={(e) => set({ id: e.target.value })}
            placeholder="my_command"
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-corti-lime disabled:opacity-60"
          />
          {id && !idValid && (
            <p className="mt-1 text-xs text-muted-foreground">
              Use letters, numbers, _ or - (no spaces).
            </p>
          )}
          {idClash && (
            <p className="mt-1 text-xs text-variant-error-foreground">
              That id is already in use.
            </p>
          )}
        </Field>

        <Field label="Phrases (one per line; use {var} for variables)">
          <textarea
            value={draft.phrasesText}
            onChange={(e) => set({ phrasesText: e.target.value })}
            rows={2}
            placeholder={"insert my signature\nsign the note"}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-corti-lime"
          />
        </Field>

        <Field label="Variables">
          <div className="flex flex-col gap-2">
            {draft.variables.map((v, i) => {
              const patchVar = (patch: Partial<DraftVariable>) =>
                set({
                  variables: draft.variables.map((x, j) =>
                    j === i ? { ...x, ...patch } : x,
                  ),
                });
              return (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={v.key}
                    onChange={(e) => patchVar({ key: e.target.value })}
                    placeholder="key"
                    className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-corti-lime"
                  />
                  <select
                    value={v.type}
                    onChange={(e) =>
                      patchVar({
                        type: e.target.value as DraftVariable["type"],
                      })
                    }
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-corti-lime"
                  >
                    <option value="enum">enum</option>
                    <option value="wildcard">wildcard</option>
                  </select>
                  {v.type === "enum" ? (
                    <input
                      value={v.enumCsv}
                      onChange={(e) => patchVar({ enumCsv: e.target.value })}
                      placeholder="value1, value2, value3"
                      className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-corti-lime"
                    />
                  ) : (
                    <span className="flex-1 text-xs text-muted-foreground">
                      open-ended free text
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      set({
                        variables: draft.variables.filter((_, j) => j !== i),
                      })
                    }
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Remove variable"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() =>
                set({
                  variables: [
                    ...draft.variables,
                    { key: "", type: "enum", enumCsv: "" },
                  ],
                })
              }
              className="self-start text-xs text-muted-foreground hover:text-foreground"
            >
              + Add variable
            </button>
            {draft.variables.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Optional — only needed for phrases that contain a {"{var}"}.
              </p>
            )}
            {draft.variables.some((v) => v.type === "wildcard") && (
              <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
                Wildcard rules: a literal trigger word must precede the variable
                (a phrase can’t start with one); multiple wildcards need a
                literal between them; ~2s silence before/after; up to 10 words;
                enums match before wildcards. Requires SDK wildcard support (PR
                #202) — emitted via a typed shim until then.
              </p>
            )}
          </div>
        </Field>

        <Field label="Action">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["insert_text", "Insert predefined text"],
                  ["keypress", "Execute keypress"],
                  ["script", "Run script"],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => set({ actionKind: kind })}
                  className={cn(
                    "rounded-md border px-3 py-1 text-sm transition-colors",
                    draft.actionKind === kind
                      ? "border-corti-lime bg-accent text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {draft.actionKind === "insert_text" && (
              <textarea
                value={draft.insertText}
                onChange={(e) => set({ insertText: e.target.value })}
                rows={2}
                placeholder="Text to insert at the cursor"
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-corti-lime"
              />
            )}
            {draft.actionKind === "keypress" && (
              <KeySequenceCapture
                combos={draft.combos}
                onChange={(combos) => set({ combos })}
              />
            )}
            {draft.actionKind === "script" && (
              <div className="flex flex-col gap-1">
                <textarea
                  value={draft.code}
                  onChange={(e) => set({ code: e.target.value })}
                  rows={7}
                  spellCheck={false}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground outline-none focus:border-corti-lime"
                />
                <p className="text-xs text-muted-foreground">
                  Runs with <code>editor</code>, <code>command</code>, and{" "}
                  <code>variables</code> in scope; <code>return</code> a string
                  to show in the debugger.
                </p>
              </div>
            )}
          </div>
        </Field>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={!valid}>
            {isEdit ? "Save" : "Add command"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {!valid && disabledReason && (
            <span className="text-xs text-muted-foreground">
              {disabledReason}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}
