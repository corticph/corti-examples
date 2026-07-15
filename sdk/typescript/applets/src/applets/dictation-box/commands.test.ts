import { describe, expect, it, vi } from "vitest";
import {
  BOX_COMMANDS,
  handleBoxCommand,
  parseOrdinal,
  type BoxActions,
} from "./commands";

describe("parseOrdinal", () => {
  it("parses number words (1-based)", () => {
    expect(parseOrdinal("one")).toBe(1);
    expect(parseOrdinal("Two")).toBe(2);
    expect(parseOrdinal("  three ")).toBe(3);
  });
  it("parses digits", () => {
    expect(parseOrdinal("1")).toBe(1);
    expect(parseOrdinal("4")).toBe(4);
  });
  it("rejects junk and zero/empty", () => {
    expect(parseOrdinal("")).toBeNull();
    expect(parseOrdinal(undefined)).toBeNull();
    expect(parseOrdinal("zero")).toBeNull();
    expect(parseOrdinal("0")).toBeNull();
    expect(parseOrdinal("banana")).toBeNull();
  });
});

function stubActions(): BoxActions {
  return {
    showBox: vi.fn(() => "shown"),
    targetBox: vi.fn(() => "targeted"),
    transfer: vi.fn(() => "transferred"),
    goToField: vi.fn((f: string) => `went ${f}`),
    pickOption: vi.fn((n: number) => `picked ${n}`),
  };
}

describe("handleBoxCommand", () => {
  it("routes the box/transfer commands to their effects", () => {
    const a = stubActions();
    expect(
      handleBoxCommand({ id: "show_dictation_box" } as any, a).description,
    ).toBe("shown");
    expect(
      handleBoxCommand({ id: "target_dictation_box" } as any, a).description,
    ).toBe("targeted");
    expect(
      handleBoxCommand({ id: "transfer_text" } as any, a).description,
    ).toBe("transferred");
    expect(a.showBox).toHaveBeenCalledOnce();
    expect(a.targetBox).toHaveBeenCalledOnce();
    expect(a.transfer).toHaveBeenCalledOnce();
  });

  it("passes the field variable to goToField", () => {
    const a = stubActions();
    const out = handleBoxCommand(
      { id: "go_to_field", variables: { field: "Severity" } } as any,
      a,
    );
    expect(a.goToField).toHaveBeenCalledWith("severity");
    expect(out.handled).toBe(true);
  });

  it("does not call goToField with no field", () => {
    const a = stubActions();
    const out = handleBoxCommand(
      { id: "go_to_field", variables: {} } as any,
      a,
    );
    expect(a.goToField).not.toHaveBeenCalled();
    expect(out.description).toBe("No field named");
  });

  it("parses the ordinal before pickOption", () => {
    const a = stubActions();
    handleBoxCommand(
      { id: "pick_option", variables: { number: "two" } } as any,
      a,
    );
    expect(a.pickOption).toHaveBeenCalledWith(2);
  });

  it("reports an unparseable ordinal without calling pickOption", () => {
    const a = stubActions();
    const out = handleBoxCommand(
      { id: "pick_option", variables: { number: "banana" } } as any,
      a,
    );
    expect(a.pickOption).not.toHaveBeenCalled();
    expect(out.description).toContain("banana");
  });

  it("flags unknown commands as unhandled", () => {
    const a = stubActions();
    expect(handleBoxCommand({ id: "nope" } as any, a).handled).toBe(false);
  });
});

describe("BOX_COMMANDS config", () => {
  it("declares every dispatched id with at least one phrase", () => {
    for (const c of BOX_COMMANDS) {
      expect(c.phrases.length).toBeGreaterThan(0);
    }
    const ids = BOX_COMMANDS.map((c) => c.id);
    expect(ids).toContain("show_dictation_box");
    expect(ids).toContain("transfer_text");
    expect(ids).toContain("go_to_field");
    expect(ids).toContain("pick_option");
  });
});
