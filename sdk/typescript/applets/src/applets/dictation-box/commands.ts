/**
 * Command catalog + dispatch for the dictation-box applet.
 *
 * These commands are app-specific (they drive the dictation box, the transfer,
 * and the mock form's fields) so the dispatch logic lives here rather than in
 * `_shared/command-dispatch.ts`. Each command maps to a callback the applet
 * supplies via `BoxActions`; `handleBoxCommand` runs the right one and returns a
 * `CommandOutcome` for the (optional) debug log.
 *
 * The signature Fluency-Direct dictation-box pattern: dictate into a scratch
 * box, then transfer the text into whichever app field you were working in.
 */
import type { Corti } from "@corti/sdk";
import type { CommandOutcome } from "../_shared/commandDispatch";

/** Field labels offered to `go to {field}` (spoken, lowercase). */
export const FIELD_LABELS = ["note one", "note two", "severity"];

/** Number words + digits offered to `pick {number}` (1-based). */
const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six"];

export const NUMBER_ENUM = [...NUMBER_WORDS, "1", "2", "3", "4", "5", "6"];

/** Resolve a spoken `{number}` ("two" / "2") to a 1-based index, or null. */
export function parseOrdinal(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const v = value.trim().toLowerCase();
  const digit = Number.parseInt(v, 10);
  if (Number.isFinite(digit) && digit > 0) {
    return digit;
  }
  const word = NUMBER_WORDS.indexOf(v);
  return word === -1 ? null : word + 1;
}

/**
 * The applet-supplied effects. Each returns a human-readable description for the
 * debug log; field/option lookups return a description even on miss so the log
 * explains why nothing happened.
 */
export interface BoxActions {
  /** Move focus + caret into the dictation box. */
  showBox(): string;
  /** Route dictation into the box without moving focus (sets the override). */
  targetBox(): string;
  /** Copy box text into the last-active form control, then clear box+override. */
  transfer(): string;
  /** Focus a field by label (text: caret to end; dropdown: open it). */
  goToField(field: string): string;
  /** Select the Nth option (1-based) in the open dropdown. */
  pickOption(index: number): string;
}

/** The `/transcribe` command config for this applet (enum variables). */
export const BOX_COMMANDS: Corti.TranscribeCommand[] = [
  {
    id: "show_dictation_box",
    phrases: ["show dictation box", "show the dictation box"],
  },
  {
    id: "target_dictation_box",
    phrases: ["target dictation box", "target the dictation box"],
  },
  {
    id: "transfer_text",
    phrases: ["transfer text", "transfer the text"],
  },
  {
    id: "go_to_field",
    phrases: ["go to {field}", "go to the {field}", "go to {field} field"],
    variables: [{ key: "field", type: "enum", enum: FIELD_LABELS }],
  },
  {
    id: "pick_option",
    phrases: ["pick {number}", "choose {number}", "option {number}"],
    variables: [{ key: "number", type: "enum", enum: NUMBER_ENUM }],
  },
];

/** Run the effect for a recognized command. */
export function handleBoxCommand(
  command: Corti.TranscribeCommandData,
  actions: BoxActions,
): CommandOutcome {
  switch (command.id) {
    case "show_dictation_box":
      return { handled: true, description: actions.showBox() };
    case "target_dictation_box":
      return { handled: true, description: actions.targetBox() };
    case "transfer_text":
      return { handled: true, description: actions.transfer() };
    case "go_to_field": {
      const field = (command.variables?.field ?? "").toLowerCase();
      if (!field) {
        return { handled: true, description: "No field named" };
      }
      return { handled: true, description: actions.goToField(field) };
    }
    case "pick_option": {
      const n = parseOrdinal(command.variables?.number);
      if (!n) {
        return {
          handled: true,
          description: `Could not parse number "${command.variables?.number ?? ""}"`,
        };
      }
      return { handled: true, description: actions.pickOption(n) };
    }
    default:
      return {
        handled: false,
        description: `Unhandled command: ${command.id}`,
      };
  }
}
