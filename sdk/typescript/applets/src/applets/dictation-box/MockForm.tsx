/**
 * A minimal mock form: two generic text areas + one custom dropdown. It's the
 * "active control" surface — dictation and `go to {field}` target whichever field
 * is focused. The form publishes a handle per field (keyed by its spoken label)
 * so the applet's command handlers can focus a field or pick a dropdown option.
 */
import { useEffect, useRef, useState } from "react";
import { Dropdown, type DropdownHandle } from "./Dropdown";

export const SEVERITY_OPTIONS = ["Mild", "Moderate", "Severe", "Critical"];

export interface FieldHandle {
  /** Spoken label, matching commands.FIELD_LABELS. */
  label: string;
  kind: "text" | "dropdown";
  /** Text: focus + caret to end. Dropdown: focus + open the list. */
  goTo(): void;
  /** Dropdown only: select the Nth option (1-based). */
  pick?(index: number): boolean;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** Styled to match the dictation box (mono, resizable, lime focus border). */
const areaClass =
  "w-full resize-y rounded-md border border-border bg-background p-2 font-mono text-sm text-foreground outline-none focus:border-corti-lime";

export function MockForm({
  onReady,
}: {
  onReady: (fields: FieldHandle[]) => void;
}) {
  const noteOneRef = useRef<HTMLTextAreaElement>(null);
  const noteTwoRef = useRef<HTMLTextAreaElement>(null);
  const severityRef = useRef<DropdownHandle>(null);
  const [severity, setSeverity] = useState("");

  useEffect(() => {
    const focusEnd = (el: HTMLTextAreaElement | null) => {
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    };
    onReady([
      {
        label: "note one",
        kind: "text",
        goTo: () => focusEnd(noteOneRef.current),
      },
      {
        label: "note two",
        kind: "text",
        goTo: () => focusEnd(noteTwoRef.current),
      },
      {
        label: "severity",
        kind: "dropdown",
        goTo: () => severityRef.current?.open(),
        pick: (i) => severityRef.current?.pick(i) ?? false,
      },
    ]);
  }, [onReady]);

  return (
    <div className="flex flex-col gap-4">
      <Field label="Note 1">
        <textarea
          ref={noteOneRef}
          rows={4}
          placeholder="Dictate or type here…"
          className={areaClass}
        />
      </Field>
      <Field label="Note 2">
        <textarea
          ref={noteTwoRef}
          rows={4}
          placeholder="Dictate or type here…"
          className={areaClass}
        />
      </Field>
      <Field label="Severity">
        <Dropdown
          ref={severityRef}
          label="severity"
          options={SEVERITY_OPTIONS}
          value={severity}
          onChange={setSeverity}
        />
      </Field>
    </div>
  );
}
