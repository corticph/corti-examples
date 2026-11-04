/**
 * Pure mapping from handheld-mic button state to actions.
 *
 * The `dictation_support` WebHID library reports each button event as a bitmask
 * of currently-pressed buttons (a *level*, not an edge) — e.g. holding RECORD
 * keeps the RECORD bit set across reports. To turn that into discrete actions we
 * diff the previous mask against the new one and look at which bits changed.
 *
 * Each device button can be mapped to one action: toggle-to-talk recording,
 * push-to-talk recording, or a (local) command by id. This module is kept
 * dependency-free and side-effect-free so it unit-tests without WebHID or the
 * (dynamically imported) package. Bit values mirror the library's `ButtonEvent`
 * enum — duplicated here as plain constants so this module never forces the
 * package to load.
 */

/** Button bit values (mirror `dictation_support`'s `ButtonEvent`). */
export const BUTTON_BIT = {
  REWIND: 1,
  PLAY: 2,
  FORWARD: 4,
  INS_OVR: 16,
  RECORD: 32,
  COMMAND: 64,
  STOP: 256,
  INSTR: 512,
  F1: 1024,
  F2: 2048,
  F3: 4096,
  F4: 8192,
  EOL_PRIO: 16384,
  TRANSCRIBE: 32768,
  TAB_BACKWARD: 65536,
  TAB_FORWARD: 131072,
  ENTER_SELECT: 1048576,
} as const;

export interface DeviceButton {
  bit: number;
  name: string;
}

/** Known buttons, in a sensible display order, for naming and the mapping UI. */
export const DEVICE_BUTTONS: DeviceButton[] = [
  { bit: BUTTON_BIT.RECORD, name: "Record" },
  { bit: BUTTON_BIT.STOP, name: "Stop" },
  { bit: BUTTON_BIT.PLAY, name: "Play" },
  { bit: BUTTON_BIT.FORWARD, name: "Forward" },
  { bit: BUTTON_BIT.REWIND, name: "Rewind" },
  { bit: BUTTON_BIT.INS_OVR, name: "Ins/Ovr" },
  { bit: BUTTON_BIT.EOL_PRIO, name: "EOL/Prio" },
  { bit: BUTTON_BIT.COMMAND, name: "Command" },
  { bit: BUTTON_BIT.INSTR, name: "Instr" },
  { bit: BUTTON_BIT.F1, name: "F1" },
  { bit: BUTTON_BIT.F2, name: "F2" },
  { bit: BUTTON_BIT.F3, name: "F3" },
  { bit: BUTTON_BIT.F4, name: "F4" },
  { bit: BUTTON_BIT.TRANSCRIBE, name: "Transcribe" },
  { bit: BUTTON_BIT.TAB_BACKWARD, name: "Tab back" },
  { bit: BUTTON_BIT.TAB_FORWARD, name: "Tab forward" },
  { bit: BUTTON_BIT.ENTER_SELECT, name: "Enter/Select" },
];

export function buttonName(bit: number): string {
  return DEVICE_BUTTONS.find((b) => b.bit === bit)?.name ?? `0x${bit.toString(16)}`;
}

/** What a button does when pressed. */
export type ButtonAction =
  | { type: "toggle" } // toggle-to-talk recording
  | { type: "push" } // push-to-talk recording
  | { type: "command"; commandId: string };

/** Button bit → action. */
export type ButtonMappings = Record<number, ButtonAction>;

/** A concrete effect to apply once a mapping resolves on a button edge. */
export type ButtonEffect =
  | { kind: "record"; op: "start" | "stop" | "toggle" }
  | { kind: "command"; commandId: string };

const rising = (prev: number, next: number, bit: number) =>
  (next & bit) !== 0 && (prev & bit) === 0;
const falling = (prev: number, next: number, bit: number) =>
  (next & bit) === 0 && (prev & bit) !== 0;

/**
 * Given the previous and current button bitmasks for one device plus the
 * configured mappings, return the effects the transition implies.
 *
 * - `toggle`:  a press flips recording on/off (release ignored).
 * - `push`:    button-down starts, button-up stops (push-to-talk).
 * - `command`: a press fires the mapped command id (release ignored).
 */
export function computeButtonEffects(
  prevMask: number,
  nextMask: number,
  mappings: ButtonMappings,
): ButtonEffect[] {
  const prev = prevMask >>> 0;
  const next = nextMask >>> 0;
  const effects: ButtonEffect[] = [];

  for (const key of Object.keys(mappings)) {
    const bit = Number(key);
    const action = mappings[bit];
    if (!bit || !action) {
      continue;
    }

    if (action.type === "command") {
      if (rising(prev, next, bit)) {
        effects.push({ kind: "command", commandId: action.commandId });
      }
    } else if (action.type === "push") {
      if (rising(prev, next, bit)) {
        effects.push({ kind: "record", op: "start" });
      } else if (falling(prev, next, bit)) {
        effects.push({ kind: "record", op: "stop" });
      }
    } else if (rising(prev, next, bit)) {
      effects.push({ kind: "record", op: "toggle" });
    }
  }

  return effects;
}

/**
 * The single newly-pressed button bit between two masks (for the live monitor
 * and learn mode), preferring known buttons. Returns 0 if nothing was pressed.
 */
export function pressedButtonBit(prevMask: number, nextMask: number): number {
  const pressed = (nextMask >>> 0) & ~(prevMask >>> 0);
  if (pressed === 0) {
    return 0;
  }
  for (const { bit } of DEVICE_BUTTONS) {
    if (pressed & bit) {
      return bit;
    }
  }
  return (pressed & -pressed) >>> 0; // lowest set bit
}
