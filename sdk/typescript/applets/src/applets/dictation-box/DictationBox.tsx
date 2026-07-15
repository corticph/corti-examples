/**
 * Applet — CONCEPT: dictation box + active-control routing (Fluency-Direct style).
 *
 * One mic, a mock form (the "active control" surface) on the left, and a scratch
 * "dictation box" on the right. Final dictation inserts at the caret of whatever
 * field is focused — like typing — EXCEPT when the box-target override is on, in
 * which case it appends to the box without stealing focus. Voice commands drive
 * the whole loop:
 *   - "show dictation box"   → focus the box (caret to end, or left in place)
 *   - "target dictation box" → route dictation into the box, focus unchanged
 *   - "transfer text"        → paste the box into the last-active form field
 *   - "go to {field}"        → focus a field / open its dropdown
 *   - "pick|option {number}" → select the Nth option in the open dropdown
 *
 * Insertion/commands go through the same EditorAdapter seam the other applets
 * use, so this is the clearest "speech-enable the UI" demonstration.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CortiDictationComponent } from "../_shared/corti-dictation-react";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useActiveControl } from "../_shared/useActiveControl";
import {
  createContentEditableAdapter,
  createTextareaAdapter,
  type EditorAdapter,
} from "../_shared/editor-adapter";
import { buildInsertion } from "../_shared/text-insertion";
import { cn } from "../_shared/utils";
import { MockForm, type FieldHandle } from "./MockForm";
import { buildDictationConfig } from "./config";
import { handleBoxCommand, type BoxActions } from "./commands";

const LANGUAGE = "en";

/** Adapter for any editable form element (text input / textarea / contenteditable). */
function formAdapter(el: HTMLElement | null): EditorAdapter | null {
  if (!el) return null;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return createTextareaAdapter(el);
  }
  if (el.isContentEditable) return createContentEditableAdapter(el);
  return null;
}

interface LogEntry {
  id: string;
  description: string;
}

const NUM_WORDS: Record<string, string> = {
  "1": "one",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
};

/** Normalize a spoken field name for tolerant matching against the labels. */
function normalizeField(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(the|field)\b/g, " ")
    .replace(/\b([1-6])\b/g, (_m, d) => NUM_WORDS[d])
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve a spoken field name to a field handle (exact, then contains-match). */
function resolveField(
  fields: Map<string, FieldHandle>,
  spoken: string,
): FieldHandle | null {
  const target = normalizeField(spoken);
  if (!target) return null;
  for (const handle of fields.values()) {
    if (normalizeField(handle.label) === target) return handle;
  }
  for (const handle of fields.values()) {
    const n = normalizeField(handle.label);
    if (target.includes(n) || n.includes(target)) return handle;
  }
  return null;
}

export function DictationBox() {
  const { authConfig } = useCortiAccessToken();
  const containerRef = useRef<HTMLDivElement>(null);
  const { adapter } = useActiveControl(containerRef);
  const adapterRef = useRef<EditorAdapter | null>(null);
  adapterRef.current = adapter;

  const boxRef = useRef<HTMLTextAreaElement>(null);
  /** Last-focused editable that is NOT the box — the transfer destination. */
  const lastFormControlRef = useRef<EditorAdapter | null>(null);
  /** Last dropdown field opened via "go to {field}" — target for "pick". */
  const lastDropdownRef = useRef<FieldHandle | null>(null);
  const fieldsRef = useRef<Map<string, FieldHandle>>(new Map());

  // Box-target override: ref drives the (synchronous) handlers, state drives the
  // "receiving dictation" visual on the box.
  const targetBoxRef = useRef(false);
  const [targetBox, setTargetBox] = useState(false);
  const setOverride = useCallback((on: boolean) => {
    targetBoxRef.current = on;
    setTargetBox(on);
  }, []);

  const [interim, setInterim] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const pushLog = useCallback((entry: LogEntry) => {
    setLog((prev) => [entry, ...prev].slice(0, 6));
  }, []);

  const dictationConfig = useMemo(() => buildDictationConfig(LANGUAGE), []);

  const onFieldsReady = useCallback((fields: FieldHandle[]) => {
    fieldsRef.current = new Map(fields.map((f) => [f.label, f]));
  }, []);

  /** Track the last-active non-box editable; focusing a field clears the override. */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || el === boxRef.current) return;
      const a = formAdapter(el);
      if (!a) return;
      lastFormControlRef.current = a;
      if (targetBoxRef.current) setOverride(false);
    };
    container.addEventListener("focusin", onFocusIn);
    return () => container.removeEventListener("focusin", onFocusIn);
  }, [setOverride]);

  /** Append a segment to the end of the box WITHOUT moving focus. */
  const appendToBox = useCallback((text: string) => {
    const el = boxRef.current;
    if (!el) return;
    const seg = buildInsertion(el.value, el.value.length, text, {
      primaryLanguage: LANGUAGE,
    });
    el.value = el.value + seg;
  }, []);

  const handleTranscript = useCallback(
    (e: CustomEvent) => {
      const data = e.detail?.data;
      if (!data || Array.isArray(data)) return;
      if (!data.isFinal) {
        setInterim(data.text);
        return;
      }
      setInterim("");
      if (targetBoxRef.current) {
        appendToBox(data.text);
      } else {
        adapterRef.current?.insert(data.text, { primaryLanguage: LANGUAGE });
      }
    },
    [appendToBox],
  );

  const actions = useMemo<BoxActions>(
    () => ({
      showBox() {
        const el = boxRef.current;
        if (!el) return "No dictation box";
        const already = document.activeElement === el;
        el.focus();
        if (!already) {
          const end = el.value.length;
          el.setSelectionRange(end, end);
        }
        setOverride(false);
        return already
          ? "Focused dictation box (caret unchanged)"
          : "Focused dictation box (caret to end)";
      },
      targetBox() {
        setOverride(true);
        return "Routing dictation to the box (focus unchanged)";
      },
      transfer() {
        const text = boxRef.current?.value ?? "";
        if (!text.trim()) return "Dictation box is empty";
        const target = lastFormControlRef.current;
        if (!target) return "No form field to transfer into";
        target.focus();
        target.insert(text, { primaryLanguage: LANGUAGE });
        if (boxRef.current) boxRef.current.value = "";
        setOverride(false);
        return "Transferred box text to the active field";
      },
      goToField(field) {
        setOverride(false);
        const f = resolveField(fieldsRef.current, field);
        if (!f) return `Unknown field: ${field}`;
        f.goTo();
        lastDropdownRef.current = f.kind === "dropdown" ? f : null;
        return `Went to ${f.label}`;
      },
      pickOption(index) {
        const f = lastDropdownRef.current;
        if (!f?.pick) return "No open dropdown to pick from";
        return f.pick(index)
          ? `Picked option ${index}`
          : `Option ${index} is out of range`;
      },
    }),
    [setOverride],
  );
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const handleCommand = useCallback(
    (e: CustomEvent) => {
      const data = e.detail?.data;
      if (!data) return;
      const outcome = handleBoxCommand(data, actionsRef.current);
      pushLog({ id: data.id, description: outcome.description });
    },
    [pushLog],
  );

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Dictation box &amp; active control
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dictate into whichever field has focus — or say a command to route
          text to the scratch box, transfer it into a form field, and navigate
          the form by voice.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left: the mock form (the active-control surface). */}
        <section className="flex-1 rounded-md border border-border bg-background/40 p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Form</h3>
          <MockForm onReady={onFieldsReady} />
        </section>

        {/* Right: mic, dictation box, command help. */}
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex justify-end">
            <CortiDictationComponent
              authConfig={authConfig}
              dictationConfig={dictationConfig}
              settingsEnabled={["device", "language", "keybinding"]}
              onTranscript={handleTranscript}
              onCommand={handleCommand}
            />
          </div>

          <div
            className={cn(
              "rounded-md border bg-background p-3 transition-colors",
              targetBox
                ? "border-corti-lime ring-1 ring-corti-lime"
                : "border-border",
            )}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Dictation box
              </span>
              {targetBox && (
                <span className="rounded-full bg-corti-lime/20 px-2 py-0.5 text-xs font-medium text-foreground">
                  Receiving dictation
                </span>
              )}
            </div>
            <textarea
              ref={boxRef}
              rows={6}
              placeholder="Say “target dictation box”, dictate, then “transfer text”…"
              className="w-full resize-y rounded-md border border-border bg-background p-2 font-mono text-sm text-foreground outline-none focus:border-corti-lime"
            />
            {interim && (
              <p className="mt-1 text-sm italic text-muted-foreground">
                {interim}
              </p>
            )}

            <p className="mt-4 text-sm font-semibold text-foreground">
              Commands
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">
                  “show dictation box”
                </span>{" "}
                — focus the box (caret to end).
              </li>
              <li>
                <span className="font-medium text-foreground">
                  “target dictation box”
                </span>{" "}
                — route dictation to the box without moving focus.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  “transfer text”
                </span>{" "}
                — paste the box into the last field you used.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  “go to {"{"}field{"}"}”
                </span>{" "}
                — focus a field (note one, note two, severity).
              </li>
              <li>
                <span className="font-medium text-foreground">
                  “pick {"{"}number{"}"}”
                </span>{" "}
                — choose an option in the open dropdown.
              </li>
            </ul>
            {log.length > 0 && (
              <div className="mt-3 border-t border-border pt-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Recent commands
                </span>
                <ul className="mt-1 space-y-0.5">
                  {log.map((entry, i) => (
                    <li
                      key={`${entry.id}-${i}`}
                      className="font-mono text-xs text-muted-foreground"
                    >
                      <span className="text-foreground">{entry.id}</span> —{" "}
                      {entry.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
