import { describe, expect, it } from "vitest";
import {
  BUTTON_BIT,
  buttonName,
  computeButtonEffects,
  pressedButtonBit,
  type ButtonMappings,
} from "./hid-recording";

const { RECORD, STOP, PLAY, F1 } = BUTTON_BIT;

describe("computeButtonEffects", () => {
  describe("toggle mapping", () => {
    const m: ButtonMappings = { [RECORD]: { type: "toggle" } };
    it("toggles on press", () => {
      expect(computeButtonEffects(0, RECORD, m)).toEqual([
        { kind: "record", op: "toggle" },
      ]);
    });
    it("ignores release", () => {
      expect(computeButtonEffects(RECORD, 0, m)).toEqual([]);
    });
    it("does nothing while held (no edge)", () => {
      expect(computeButtonEffects(RECORD, RECORD, m)).toEqual([]);
    });
  });

  describe("push mapping", () => {
    const m: ButtonMappings = { [RECORD]: { type: "push" } };
    it("starts on down, stops on up", () => {
      expect(computeButtonEffects(0, RECORD, m)).toEqual([
        { kind: "record", op: "start" },
      ]);
      expect(computeButtonEffects(RECORD, 0, m)).toEqual([
        { kind: "record", op: "stop" },
      ]);
    });
  });

  describe("command mapping", () => {
    const m: ButtonMappings = {
      [F1]: { type: "command", commandId: "new_paragraph" },
    };
    it("fires command on press", () => {
      expect(computeButtonEffects(0, F1, m)).toEqual([
        { kind: "command", commandId: "new_paragraph" },
      ]);
    });
    it("ignores release", () => {
      expect(computeButtonEffects(F1, 0, m)).toEqual([]);
    });
  });

  it("ignores unmapped buttons", () => {
    const m: ButtonMappings = { [RECORD]: { type: "toggle" } };
    expect(computeButtonEffects(0, PLAY, m)).toEqual([]);
  });

  it("resolves multiple mappings independently in one transition", () => {
    const m: ButtonMappings = {
      [RECORD]: { type: "toggle" },
      [STOP]: { type: "command", commandId: "delete_that" },
    };
    expect(computeButtonEffects(0, RECORD | STOP, m)).toEqual([
      { kind: "record", op: "toggle" },
      { kind: "command", commandId: "delete_that" },
    ]);
  });

  it("treats masks as unsigned (high bits set)", () => {
    const m: ButtonMappings = { [RECORD]: { type: "push" } };
    const all = -1 >>> 0; // 0xFFFFFFFF, RECORD set
    expect(computeButtonEffects(all, (all & ~RECORD) >>> 0, m)).toEqual([
      { kind: "record", op: "stop" },
    ]);
  });
});

describe("pressedButtonBit", () => {
  it("returns the newly-pressed known bit", () => {
    expect(pressedButtonBit(0, RECORD)).toBe(RECORD);
    expect(pressedButtonBit(RECORD, RECORD | F1)).toBe(F1);
  });
  it("returns 0 on release / no change", () => {
    expect(pressedButtonBit(RECORD, 0)).toBe(0);
    expect(pressedButtonBit(RECORD, RECORD)).toBe(0);
  });
});

describe("buttonName", () => {
  it("names known buttons and hex-falls-back for unknown", () => {
    expect(buttonName(RECORD)).toBe("Record");
    expect(buttonName(0x800000)).toBe("0x800000");
  });
});
