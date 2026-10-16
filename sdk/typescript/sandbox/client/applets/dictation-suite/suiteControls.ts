/**
 * Voice control of the suite itself (the AppControlAdapter half of the
 * integration, as opposed to EditorAdapter's text-in/text-out half).
 *
 * These commands don't edit text — they drive the application: run the cleanup
 * agent, open a side panel, put the caret back in the editor. They're declared
 * in the same dictation config as the editing commands, so one socket carries
 * both, and dispatched through the shared AppControlRegistry so each control can
 * report its own availability and state.
 *
 * Deliberately NOT voice-triggerable: clearing the draft. A misrecognition there
 * destroys dictated text, so it stays a button.
 */
import type { Corti } from "@corti/sdk";
import { COPY_EDIT_COMMAND_ID } from "../on-demand-agent/agent";

export const SUITE_SHOW_PANEL_COMMAND_ID = "suite_show_panel";
export const SUITE_FOCUS_EDITOR_COMMAND_ID = "suite_focus_editor";

/** Side panels, in the order they appear in the UI. */
export const PANELS = [
  { id: "commands", label: "Commands" },
  { id: "replacements", label: "Replacements" },
  { id: "terms", label: "Dictionary" },
  { id: "formatting", label: "Formatting" },
  { id: "cleanup", label: "Cleanup" },
  { id: "device", label: "Microphone buttons" },
  { id: "archive", label: "Archive" },
] as const;

export type PanelId = (typeof PANELS)[number]["id"];

/** Spoken words that resolve to each panel, beyond its own label. */
const PANEL_ALIASES: Record<PanelId, string[]> = {
  commands: ["commands", "voice commands"],
  replacements: ["replacements", "replacement rules"],
  terms: ["dictionary", "terms", "vocabulary"],
  formatting: ["formatting", "format"],
  cleanup: ["cleanup", "agent", "copy edit"],
  device: ["dictaphone", "device", "buttons", "microphone"],
  archive: ["archive", "recordings", "audio"],
};

const PANEL_ENUM = Array.from(new Set(Object.values(PANEL_ALIASES).flat()));

/** Resolve a spoken panel name to a panel id. */
export function resolvePanel(spoken: string): PanelId | null {
  const target = spoken.toLowerCase().trim();
  if (!target) {
    return null;
  }
  for (const [id, aliases] of Object.entries(PANEL_ALIASES)) {
    if (aliases.some((a) => a === target)) {
      return id as PanelId;
    }
  }
  // Fall back to a contains match so "the dictionary panel" still lands.
  for (const [id, aliases] of Object.entries(PANEL_ALIASES)) {
    if (aliases.some((a) => target.includes(a))) {
      return id as PanelId;
    }
  }
  return null;
}

/**
 * The suite's own commands, merged into the config alongside the user's editing
 * commands. `copy_edit` reuses the on-demand-agent's id so that module's
 * run/status semantics carry over unchanged.
 */
export const SUITE_COMMANDS: Corti.TranscribeCommand[] = [
  {
    id: COPY_EDIT_COMMAND_ID,
    phrases: ["run cleanup", "clean up", "copy edit", "proofread"],
  },
  {
    id: SUITE_SHOW_PANEL_COMMAND_ID,
    phrases: ["show {panel}", "open {panel}"],
    variables: [{ key: "panel", type: "enum", enum: PANEL_ENUM }],
  },
  {
    id: SUITE_FOCUS_EDITOR_COMMAND_ID,
    phrases: ["focus editor", "go to editor", "back to editor"],
  },
];
