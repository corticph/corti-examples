/**
 * Data model for the dictation-commands manager.
 *
 * A `ManagedCommand` couples the API command config (id / phrases / variables —
 * sent to /transcribe) with a client-side `action` that the dispatcher executes
 * when the command is recognized. The catalog below is preloaded from the Corti
 * examples + docs; users can add their own (Phase 1b).
 */
import type { Corti } from "@corti/sdk";
import {
  type CommandAction,
  type CommandRegistry,
  executeAction,
  type KeyCombo,
} from "../_shared/commandDispatch";

export type ManagedVariable =
  | { key: string; type: "enum"; enum: string[] }
  | { key: string; type: "wildcard" };

export interface ManagedCommand {
  id: string;
  phrases: string[];
  variables?: ManagedVariable[];
  action: CommandAction;
  /** Preloaded catalog command (vs. user-created). */
  builtin?: boolean;
  description?: string;
}

/** Canned templates for the `insert_template` command. */
export const TEMPLATES: Record<string, string> = {
  soap: "Subjective:\n[ ]\n\nObjective:\n[ ]\n\nAssessment:\n[ ]\n\nPlan:\n[ ]\n",
  progress: "Interval history:\nExam:\nImpression:\n",
  discharge: "Discharge diagnosis:\nMedications:\nFollow-up:\n",
};

/** Words offered to `select_word` (enum today; wildcard in Phase 1c). */
export const SELECTABLE_WORDS = ["patient", "history", "pain", "medication"];

function primaryShortcut(key: string): KeyCombo {
  // `applyKeyCombo` interprets Ctrl or Cmd as the primary modifier and applies
  // built-in editor navigation semantics directly, so one definition works on
  // both macOS and Windows.
  return { meta: true, key };
}

/**
 * Convert managed commands to the `/transcribe` command config. Wildcard
 * variables are cast through `unknown` because `@corti/dictation-web@0.7.0` only
 * types `type: "enum"` — drop the cast once the SDK ships wildcard (PR #202).
 */
export function toTranscribeCommands(cmds: ManagedCommand[]): Corti.TranscribeCommand[] {
  return cmds.map((c) => ({
    id: c.id,
    phrases: c.phrases,
    variables: c.variables?.map((v) =>
      v.type === "enum"
        ? { key: v.key, type: "enum" as const, enum: v.enum }
        : ({
            key: v.key,
            type: "wildcard",
          } as unknown as Corti.TranscribeCommandVariable),
    ),
  }));
}

/** Build a dispatch registry that runs each command's configured action. */
export function buildRegistry(cmds: ManagedCommand[]): CommandRegistry {
  const registry: CommandRegistry = {};
  for (const c of cmds) {
    registry[c.id] = (adapter, command, ctx) => executeAction(adapter, c.action, command, ctx);
  }
  return registry;
}

/** Preloaded command catalog (Corti examples + docs), with executable actions. */
export const CATALOG: ManagedCommand[] = [
  {
    id: "delete_that",
    phrases: ["delete that", "delete last"],
    action: { kind: "delete_last" },
    builtin: true,
    description: "Delete the last dictated segment",
  },
  {
    id: "capitalize_that",
    phrases: ["capitalize that", "cap that"],
    action: { kind: "capitalize_last" },
    builtin: true,
    description: "Capitalize the last dictated segment",
  },
  {
    id: "insert_template",
    phrases: ["insert my {template} template", "insert {template} template"],
    variables: [{ key: "template", type: "enum", enum: Object.keys(TEMPLATES) }],
    action: { kind: "insert_template", variableKey: "template" },
    builtin: true,
    description: "Insert a predefined template (enum variable)",
  },
  {
    id: "select_word",
    phrases: ["select {word}"],
    variables: [{ key: "word", type: "enum", enum: SELECTABLE_WORDS }],
    action: { kind: "select_wildcard", variableKey: "word" },
    builtin: true,
    description: "Select a word (enum) so the next dictation replaces it",
  },
  {
    id: "select_text",
    phrases: ["select {text}"],
    variables: [{ key: "text", type: "wildcard" }],
    action: {
      kind: "script",
      code: [
        "// Find the spoken text in the editor and select it.",
        "// Available: editor (EditorAdapter), command, variables.",
        "const t = (variables.text || '').trim();",
        "if (!t) return 'no text';",
        "const i = editor.getText().toLowerCase().lastIndexOf(t.toLowerCase());",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional — this string is evaluated code containing template literals
        'if (i < 0) return `"${t}" not found`;',
        "editor.setSelection(i, i + t.length);",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional — this string is evaluated code containing template literals
        'return `selected "${t}"`;',
      ].join("\n"),
    },
    builtin: true,
    description:
      "Select free-text spoken by the user (wildcard) via a script action — the same capability as select_word, expressed as a user-editable script. Requires SDK wildcard support (PR #202).",
  },
  {
    id: "select_range",
    phrases: ["select {range}"],
    variables: [
      {
        key: "range",
        type: "enum",
        enum: ["all", "the last word", "the last sentence"],
      },
    ],
    action: { kind: "select_enum", variableKey: "range" },
    builtin: true,
    description: "Select a relative range (enum variable)",
  },
  {
    id: "format_that",
    phrases: ["format that {style}", "format {style}"],
    variables: [
      {
        key: "style",
        type: "enum",
        enum: ["bold", "italic", "underline", "normal"],
      },
    ],
    action: { kind: "format", variableKey: "style" },
    builtin: true,
    description: "Format the selection (rich-text editors)",
  },
  {
    id: "bold_that",
    phrases: ["bold that"],
    action: { kind: "keypress", combos: [{ ctrl: true, key: "b" }] },
    builtin: true,
    description: "Apply bold via a keypress action",
  },
  {
    id: "go_to_end_of_document",
    phrases: ["go to end of document", "end of document"],
    action: {
      kind: "keypress",
      combos: [primaryShortcut("ArrowDown")],
    },
    builtin: true,
    description: "Move the caret to the end of the document (Cmd+Down / Ctrl+End semantics)",
  },
  {
    id: "go_to_beginning_of_document",
    phrases: ["go to beginning of document", "beginning of document"],
    action: {
      kind: "keypress",
      combos: [primaryShortcut("ArrowUp")],
    },
    builtin: true,
    description: "Move the caret to the beginning of the document (Cmd+Up / Ctrl+Home semantics)",
  },
  {
    id: "go_to_end_of_line",
    phrases: ["go to end of line", "end of line"],
    action: {
      kind: "keypress",
      combos: [primaryShortcut("ArrowRight")],
    },
    builtin: true,
    description: "Move the caret to the end of the current line (Cmd+Right / End semantics)",
  },
  {
    id: "go_to_beginning_of_line",
    phrases: ["go to beginning of line", "beginning of line"],
    action: {
      kind: "keypress",
      combos: [primaryShortcut("ArrowLeft")],
    },
    builtin: true,
    description: "Move the caret to the beginning of the current line (Cmd+Left / Home semantics)",
  },
  {
    id: "select_all",
    phrases: ["select all"],
    action: {
      kind: "keypress",
      combos: [primaryShortcut("a")],
    },
    builtin: true,
    description: "Select the entire document (Cmd+A / Ctrl+A semantics)",
  },
  {
    id: "go_to_section",
    phrases: ["go to {section} section"],
    variables: [
      {
        key: "section",
        type: "enum",
        enum: ["subjective", "objective", "assessment", "plan"],
      },
    ],
    action: {
      kind: "noop",
      note: "Navigation — wire to your app's section focus",
    },
    builtin: true,
    description: "Navigate to a section (example; no-op in this editor)",
  },
  {
    id: "insert_field",
    phrases: ["insert field", "new field"],
    action: { kind: "insert_text", text: "[ ]" },
    builtin: true,
    description: 'Insert an empty field placeholder "[ ]"',
  },
  {
    id: "next_field",
    phrases: ["next field"],
    action: {
      kind: "script",
      code: [
        "// Select the next field (bracketed [ ]) after the caret,",
        "// wrapping to the first field when none follow.",
        "const text = editor.getText();",
        "const sel = editor.getSelection();",
        "const re = /\\[[^\\]]*\\]/g;",
        "const fields = [];",
        "let m;",
        "while ((m = re.exec(text)) !== null) {",
        "  fields.push([m.index, m.index + m[0].length]);",
        "}",
        "if (!fields.length) return 'no fields';",
        "const f = fields.find((r) => r[0] >= sel.end) || fields[0];",
        "editor.setSelection(f[0], f[1]);",
        "return f[0] >= sel.end ? 'next field' : 'wrapped to first field';",
      ].join("\n"),
    },
    builtin: true,
    description: "Jump to the next field placeholder after the caret (wraps to first)",
  },
  {
    id: "previous_field",
    phrases: ["previous field"],
    action: {
      kind: "script",
      code: [
        "// Select the previous field (bracketed [ ]) before the caret,",
        "// wrapping to the last field when none precede.",
        "const text = editor.getText();",
        "const sel = editor.getSelection();",
        "const re = /\\[[^\\]]*\\]/g;",
        "const fields = [];",
        "let m;",
        "while ((m = re.exec(text)) !== null) {",
        "  fields.push([m.index, m.index + m[0].length]);",
        "}",
        "if (!fields.length) return 'no fields';",
        "let target = null;",
        "for (const r of fields) { if (r[1] <= sel.start) target = r; }",
        "const f = target || fields[fields.length - 1];",
        "editor.setSelection(f[0], f[1]);",
        "return target ? 'previous field' : 'wrapped to last field';",
      ].join("\n"),
    },
    builtin: true,
    description: "Jump to the previous field placeholder before the caret (wraps to last)",
  },
  {
    id: "first_field",
    phrases: ["first field"],
    action: {
      kind: "script",
      code: [
        "// Select the first field (bracketed [ ]) in the editor.",
        "const text = editor.getText();",
        "const m = /\\[[^\\]]*\\]/.exec(text);",
        "if (!m) return 'no fields';",
        "editor.setSelection(m.index, m.index + m[0].length);",
        "return 'first field';",
      ].join("\n"),
    },
    builtin: true,
    description: "Jump to the first field placeholder in the editor",
  },
  {
    id: "last_field",
    phrases: ["last field"],
    action: {
      kind: "script",
      code: [
        "// Select the last field (bracketed [ ]) in the editor.",
        "const text = editor.getText();",
        "const re = /\\[[^\\]]*\\]/g;",
        "let m, last = null;",
        "while ((m = re.exec(text)) !== null) last = m;",
        "if (!last) return 'no fields';",
        "editor.setSelection(last.index, last.index + last[0].length);",
        "return 'last field';",
      ].join("\n"),
    },
    builtin: true,
    description: "Jump to the last field placeholder in the editor",
  },
];
