/**
 * Command catalog + dispatch for the app-control applet.
 *
 * Where the dictation-box commands moved text around, these commands drive the
 * application: switch tabs, open/close a panel, click buttons, confirm/cancel a
 * dialog. Each maps to a target on the shared AppControlRegistry, which resolves
 * the spoken label to a registered control and runs it (availability-gated).
 */
import type { Corti } from "@corti/sdk";
import type { AppControlOutcome, AppControlRegistry } from "../_shared/appControlAdapter";

export const TAB_LABELS = ["overview", "orders", "notes"];
export const PANEL_LABELS = ["details"];

/** The `/transcribe` command config for this applet (enum variables). */
export const APP_COMMANDS: Corti.TranscribeCommand[] = [
  {
    id: "switch_tab",
    phrases: ["go to {tab}", "switch to {tab}", "open {tab} tab"],
    variables: [{ key: "tab", type: "enum", enum: TAB_LABELS }],
  },
  {
    id: "open_panel",
    phrases: ["open {panel}", "show {panel}"],
    variables: [{ key: "panel", type: "enum", enum: PANEL_LABELS }],
  },
  {
    id: "close_panel",
    phrases: ["close {panel}", "hide {panel}"],
    variables: [{ key: "panel", type: "enum", enum: PANEL_LABELS }],
  },
  // Action buttons are verb-led, full-phrase commands (more reliably recognized
  // than a generic "click {button}" enum slot, and natural to speak).
  {
    id: "new_order",
    phrases: [
      "create new order",
      "create order",
      "add new order",
      "select new order",
      "click new order",
    ],
  },
  {
    id: "save_note",
    phrases: ["save note", "save the note", "save changes", "click save"],
  },
  { id: "confirm_dialog", phrases: ["confirm", "yes confirm", "ok confirm"] },
  { id: "cancel_dialog", phrases: ["cancel", "dismiss", "close dialog"] },
];

/** Run the effect for a recognized command against the app-control registry. */
export function handleAppCommand(
  command: Corti.TranscribeCommandData,
  registry: AppControlRegistry,
): AppControlOutcome {
  const v = command.variables ?? {};
  switch (command.id) {
    case "switch_tab":
      return registry.run(v.tab ?? "");
    case "open_panel":
      return registry.run(v.panel ?? "", "open");
    case "close_panel":
      return registry.run(v.panel ?? "", "close");
    case "new_order":
      return registry.run("new-order");
    case "save_note":
      return registry.run("save");
    case "confirm_dialog":
      return registry.run("confirm");
    case "cancel_dialog":
      return registry.run("cancel");
    default:
      return {
        handled: false,
        description: `Unhandled command: ${command.id}`,
      };
  }
}
