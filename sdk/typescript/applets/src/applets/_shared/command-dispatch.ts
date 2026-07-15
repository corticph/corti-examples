/**
 * Generic command dispatch: maps a server `command` (id + variables) to a real
 * action on an EditorAdapter. Handlers are small and composable; an applet
 * builds a registry of { commandId: handler } and feeds incoming commands in.
 *
 * Handlers operate through the adapter, so the same command logic works for a
 * textarea, a contenteditable surface, or a future native control. Variable
 * values come from `command.variables`; whether a variable was defined as an
 * enum or a wildcard is irrelevant here — the handler just reads the value.
 *
 * Portable: depends only on editor-adapter.ts, offset-map.ts and the SDK type.
 */
import type { Corti } from "@corti/sdk";
import type { EditorAdapter, FormatStyle } from "./editor-adapter";
import type { Range } from "./offset-map";

export interface DispatchContext {
  /** Ranges of committed dictation segments, oldest→newest (for "delete that"). */
  history: Range[];
  /** Named templates for insert-template style commands. */
  templates?: Record<string, string>;
  primaryLanguage?: string;
}

export interface CommandOutcome {
  handled: boolean;
  description: string;
  /** Replacement history when a handler changed it (e.g. delete popped one). */
  history?: Range[];
}

export type CommandHandler = (
  adapter: EditorAdapter,
  command: Corti.TranscribeCommandData,
  ctx: DispatchContext,
) => CommandOutcome;

export type CommandRegistry = Record<string, CommandHandler>;

/* ------------------------------ helpers ------------------------------ */

export function lastWordRange(text: string): Range | null {
  const m = /(\S+)\s*$/.exec(text);
  if (!m) return null;
  const start = text.lastIndexOf(m[1]);
  return { start, end: start + m[1].length };
}

export function lastSentenceRange(text: string): Range | null {
  const trimmedEnd = text.replace(/\s+$/, "");
  if (!trimmedEnd) return null;
  // Find the start of the final sentence: char after the previous . ! ?
  const prevEnd = Math.max(
    trimmedEnd.lastIndexOf(".", trimmedEnd.length - 2),
    trimmedEnd.lastIndexOf("!", trimmedEnd.length - 2),
    trimmedEnd.lastIndexOf("?", trimmedEnd.length - 2),
  );
  const start = prevEnd === -1 ? 0 : prevEnd + 1;
  const leading = trimmedEnd.slice(start).match(/^\s*/)?.[0].length ?? 0;
  return { start: start + leading, end: trimmedEnd.length };
}

function lastOccurrenceRange(text: string, needle: string): Range | null {
  if (!needle) return null;
  const idx = text.toLowerCase().lastIndexOf(needle.toLowerCase());
  if (idx === -1) return null;
  return { start: idx, end: idx + needle.length };
}

/* --------------------------- core handlers --------------------------- */

/** Delete the most recently inserted dictation segment (or the selection). */
export const deleteLastSegment: CommandHandler = (adapter, _cmd, ctx) => {
  const sel = adapter.getSelection();
  if (sel.end > sel.start) {
    adapter.replaceRange(sel.start, sel.end, "");
    return { handled: true, description: "Deleted selection" };
  }
  const last = ctx.history[ctx.history.length - 1];
  if (!last) return { handled: true, description: "Nothing to delete" };
  adapter.replaceRange(last.start, last.end, "");
  return {
    handled: true,
    description: "Deleted last segment",
    history: ctx.history.slice(0, -1),
  };
};

/** Insert a line break at the caret. */
export const insertParagraph: CommandHandler = (adapter) => {
  const { start, end } = adapter.getSelection();
  adapter.replaceRange(start, end, "\n");
  return { handled: true, description: "Inserted paragraph break" };
};

/** Capitalize the first letter of the last inserted dictation segment. */
export const capitalizeLastSegment: CommandHandler = (adapter, _cmd, ctx) => {
  const last = ctx.history[ctx.history.length - 1];
  if (!last) return { handled: true, description: "Nothing to capitalize" };
  const text = adapter.getText();
  const target = text.slice(last.start, last.end);
  const capped = target.replace(
    /^(\s*)(\p{L})/u,
    (_m, ws, ch) => ws + ch.toUpperCase(),
  );
  if (capped !== target) adapter.replaceRange(last.start, last.end, capped);
  return { handled: true, description: "Capitalized last segment" };
};

/** Insert a named template (enum variable, e.g. "soap"). */
export function insertTemplate(variableKey = "template"): CommandHandler {
  return (adapter, command, ctx) => {
    const name = command.variables?.[variableKey] ?? "";
    const template = name ? ctx.templates?.[name] : undefined;
    if (!template) {
      return { handled: true, description: `Unknown template: ${name}` };
    }
    const { start, end } = adapter.getSelection();
    adapter.replaceRange(start, end, template);
    return { handled: true, description: `Inserted ${name} template` };
  };
}

/** Select a relative range (enum: "all" | "the last word" | "the last sentence"). */
export function selectEnumRange(variableKey = "range"): CommandHandler {
  return (adapter, command) => {
    const choice = (command.variables?.[variableKey] ?? "").toLowerCase();
    const text = adapter.getText();
    let range: Range | null = null;
    if (choice.includes("all")) range = { start: 0, end: text.length };
    else if (choice.includes("sentence")) range = lastSentenceRange(text);
    else if (choice.includes("word")) range = lastWordRange(text);
    if (!range)
      return { handled: true, description: `Cannot select "${choice}"` };
    adapter.setSelection(range.start, range.end);
    return { handled: true, description: `Selected ${choice}` };
  };
}

/**
 * Select free-text spoken by the user (wildcard variable). The next dictation
 * segment then overwrites the selection. Ready for `type: "wildcard"` once the
 * SDK ships it; works today with any variable carrying the spoken text.
 */
export function selectWildcardText(variableKey = "utterance"): CommandHandler {
  return (adapter, command) => {
    const needle = command.variables?.[variableKey] ?? "";
    const range = lastOccurrenceRange(adapter.getText(), needle);
    if (!range) return { handled: true, description: `"${needle}" not found` };
    adapter.setSelection(range.start, range.end);
    return { handled: true, description: `Selected "${needle}"` };
  };
}

/** Apply a formatting style to the selection (enum: bold/italic/underline/normal). */
export function formatSelection(variableKey = "style"): CommandHandler {
  return (adapter, command) => {
    const style = (command.variables?.[variableKey] ?? "") as FormatStyle;
    if (!adapter.applyFormat) {
      return { handled: true, description: "Formatting not supported here" };
    }
    adapter.applyFormat(style);
    return { handled: true, description: `Applied ${style}` };
  };
}

/* ------------------------------- actions ----------------------------- */

export interface KeyCombo {
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** The main key, e.g. "b", "Enter", "ArrowLeft". */
  key: string;
}

/**
 * A client-side action a command triggers. `insert_text` and `keypress` are the
 * two user-creatable kinds (a text box / a keystroke capture in the UI); the
 * rest are built-in editor actions used by the preloaded catalog.
 */
export type CommandAction =
  | { kind: "insert_text"; text: string }
  | { kind: "keypress"; combos: KeyCombo[] }
  | { kind: "script"; code: string }
  | { kind: "delete_last" }
  | { kind: "new_paragraph" }
  | { kind: "capitalize_last" }
  | { kind: "insert_template"; variableKey: string }
  | { kind: "select_enum"; variableKey: string }
  | { kind: "select_wildcard"; variableKey: string }
  | { kind: "format"; variableKey: string }
  | { kind: "noop"; note?: string };

export function describeCombo(c: KeyCombo): string {
  const parts: string[] = [];
  if (c.meta) parts.push("Cmd");
  if (c.ctrl) parts.push("Ctrl");
  if (c.alt) parts.push("Alt");
  if (c.shift) parts.push("Shift");
  parts.push(c.key.length === 1 ? c.key.toUpperCase() : c.key);
  return parts.join("+");
}

/** True for a plain printable key (no Ctrl/Cmd/Alt) we can type literally. */
function isPrintable(c: KeyCombo): boolean {
  if (c.ctrl || c.meta || c.alt) return false;
  return (
    c.key.length === 1 || c.key === "Enter" || c.key === "Tab" || c.key === " "
  );
}

function literalOf(c: KeyCombo): string {
  if (c.key === "Enter") return "\n";
  if (c.key === "Tab") return "\t";
  if (c.key === " ") return " ";
  return c.key;
}

function lineStartOffset(text: string, offset: number): number {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const idx = text.lastIndexOf("\n", Math.max(0, clamped - 1));
  return idx === -1 ? 0 : idx + 1;
}

function lineEndOffset(text: string, offset: number): number {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const idx = text.indexOf("\n", clamped);
  return idx === -1 ? text.length : idx;
}

/** Human-readable rendering of a captured key sequence. */
export function describeSequence(combos: KeyCombo[]): string {
  return combos
    .map((c) =>
      isPrintable(c) ? (c.key === " " ? "␣" : c.key) : describeCombo(c),
    )
    .join(" ");
}

/**
 * Apply a keystroke. Well-known editor combos (Ctrl/Cmd+B/I/U) map to adapter
 * formatting; anything else is dispatched as a synthetic KeyboardEvent on the
 * active element — note that synthetic events do NOT trigger native edit actions
 * (browser security), so this is best-effort/illustrative for arbitrary keys.
 */
export function applyKeyCombo(
  adapter: EditorAdapter,
  combo: KeyCombo,
): CommandOutcome {
  const mod = combo.meta || combo.ctrl;
  const k = combo.key.toLowerCase();
  if (mod && !combo.alt && adapter.applyFormat) {
    if (k === "b") {
      adapter.applyFormat("bold");
      return {
        handled: true,
        description: `Applied bold (${describeCombo(combo)})`,
      };
    }
    if (k === "i") {
      adapter.applyFormat("italic");
      return {
        handled: true,
        description: `Applied italic (${describeCombo(combo)})`,
      };
    }
    if (k === "u") {
      adapter.applyFormat("underline");
      return {
        handled: true,
        description: `Applied underline (${describeCombo(combo)})`,
      };
    }
  }
  if (mod && !combo.alt && !combo.shift) {
    const text = adapter.getText();
    const selection = adapter.getSelection();
    const caret = selection.end;
    if (k === "a") {
      adapter.setSelection(0, text.length);
      return {
        handled: true,
        description: `Selected all (${describeCombo(combo)})`,
      };
    }
    if (k === "arrowdown") {
      adapter.setSelection(text.length, text.length);
      return {
        handled: true,
        description: `Moved to end of document (${describeCombo(combo)})`,
      };
    }
    if (k === "arrowup") {
      adapter.setSelection(0, 0);
      return {
        handled: true,
        description: `Moved to beginning of document (${describeCombo(combo)})`,
      };
    }
    if (k === "arrowright") {
      const next = lineEndOffset(text, caret);
      adapter.setSelection(next, next);
      return {
        handled: true,
        description: `Moved to end of line (${describeCombo(combo)})`,
      };
    }
    if (k === "arrowleft") {
      const next = lineStartOffset(text, caret);
      adapter.setSelection(next, next);
      return {
        handled: true,
        description: `Moved to beginning of line (${describeCombo(combo)})`,
      };
    }
  }
  if (typeof document !== "undefined" && document.activeElement) {
    document.activeElement.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: combo.key,
        ctrlKey: !!combo.ctrl,
        metaKey: !!combo.meta,
        altKey: !!combo.alt,
        shiftKey: !!combo.shift,
        bubbles: true,
      }),
    );
  }
  return {
    handled: true,
    description: `Sent ${describeCombo(combo)} (synthetic — native edits may not fire)`,
  };
}

/**
 * Replay a captured key sequence. Runs of plain printable keys are typed
 * literally into the editor; modifier combos (e.g. Ctrl+B) are applied via
 * applyKeyCombo. This lets a macro like ". v i t a l s" insert ". vitals".
 */
export function applyKeySequence(
  adapter: EditorAdapter,
  combos: KeyCombo[],
): CommandOutcome {
  let literal = "";
  const flush = () => {
    if (!literal) return;
    const { start, end } = adapter.getSelection();
    adapter.replaceRange(start, end, literal);
    literal = "";
  };
  for (const c of combos) {
    if (isPrintable(c)) literal += literalOf(c);
    else {
      flush();
      applyKeyCombo(adapter, c);
    }
  }
  flush();
  return {
    handled: true,
    description: `Ran keystrokes: ${describeSequence(combos)}`,
  };
}

/**
 * Run a user-provided script for a command. The script body runs with three
 * locals: `editor` (the EditorAdapter), `command` (the server command data),
 * and `variables` (its variables). It may `return` a string to show in the
 * debugger. Intended for an internal/dev tool — it evaluates author-provided
 * code, so do not expose to untrusted users.
 */
export function runScript(
  adapter: EditorAdapter,
  code: string,
  command: Corti.TranscribeCommandData,
  _ctx: DispatchContext,
): CommandOutcome {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("editor", "command", "variables", code);
    const result = fn(adapter, command, command.variables ?? {});
    return {
      handled: true,
      description: typeof result === "string" && result ? result : "Ran script",
    };
  } catch (e) {
    return {
      handled: true,
      description: `Script error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** Execute a command's configured action against the editor. */
export function executeAction(
  adapter: EditorAdapter,
  action: CommandAction,
  command: Corti.TranscribeCommandData,
  ctx: DispatchContext,
): CommandOutcome {
  switch (action.kind) {
    case "insert_text": {
      const { start, end } = adapter.getSelection();
      adapter.replaceRange(start, end, action.text);
      return { handled: true, description: "Inserted text" };
    }
    case "keypress":
      return applyKeySequence(adapter, action.combos);
    case "script":
      return runScript(adapter, action.code, command, ctx);
    case "delete_last":
      return deleteLastSegment(adapter, command, ctx);
    case "new_paragraph":
      return insertParagraph(adapter, command, ctx);
    case "capitalize_last":
      return capitalizeLastSegment(adapter, command, ctx);
    case "insert_template":
      return insertTemplate(action.variableKey)(adapter, command, ctx);
    case "select_enum":
      return selectEnumRange(action.variableKey)(adapter, command, ctx);
    case "select_wildcard":
      return selectWildcardText(action.variableKey)(adapter, command, ctx);
    case "format":
      return formatSelection(action.variableKey)(adapter, command, ctx);
    case "noop":
      return { handled: true, description: action.note ?? "No editor action" };
  }
}

/* ------------------------------ dispatch ----------------------------- */

export function dispatchCommand(
  adapter: EditorAdapter,
  command: Corti.TranscribeCommandData,
  registry: CommandRegistry,
  ctx: DispatchContext,
): CommandOutcome {
  const handler = registry[command.id];
  if (!handler) {
    return { handled: false, description: `Unhandled command: ${command.id}` };
  }
  return handler(adapter, command, ctx);
}
