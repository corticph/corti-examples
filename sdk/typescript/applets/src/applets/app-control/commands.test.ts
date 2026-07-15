import { describe, expect, it, vi } from "vitest";
import { createAppControlRegistry } from "../_shared/app-control-adapter";
import { APP_COMMANDS, handleAppCommand } from "./commands";

function registryWithSpies() {
  const r = createAppControlRegistry();
  const calls: { id: string; arg?: string }[] = [];
  const make = (id: string, label: string, extra = {}) =>
    r.register({
      id,
      label,
      kind: "action",
      run: (arg) => calls.push({ id, arg }),
      ...extra,
    });
  make("tab-notes", "notes");
  make("details", "details");
  make("new-order", "new order");
  make("save", "save");
  make("confirm", "confirm", { isAvailable: () => false });
  return { r, calls };
}

describe("handleAppCommand", () => {
  it("switch_tab resolves the tab label to its control", () => {
    const { r, calls } = registryWithSpies();
    handleAppCommand(
      { id: "switch_tab", variables: { tab: "notes" } } as any,
      r,
    );
    expect(calls).toEqual([{ id: "tab-notes", arg: undefined }]);
  });

  it("open_panel / close_panel pass the open/close arg", () => {
    const { r, calls } = registryWithSpies();
    handleAppCommand(
      { id: "open_panel", variables: { panel: "details" } } as any,
      r,
    );
    handleAppCommand(
      { id: "close_panel", variables: { panel: "details" } } as any,
      r,
    );
    expect(calls).toEqual([
      { id: "details", arg: "open" },
      { id: "details", arg: "close" },
    ]);
  });

  it("new_order / save_note run their buttons by id", () => {
    const { r, calls } = registryWithSpies();
    handleAppCommand({ id: "new_order" } as any, r);
    handleAppCommand({ id: "save_note" } as any, r);
    expect(calls).toEqual([
      { id: "new-order", arg: undefined },
      { id: "save", arg: undefined },
    ]);
  });

  it("confirm is gated by isAvailable and does not run when closed", () => {
    const { r, calls } = registryWithSpies();
    const out = handleAppCommand({ id: "confirm_dialog" } as any, r);
    expect(calls).toEqual([]);
    expect(out.description).toContain("not available");
  });

  it("unknown command is unhandled", () => {
    const { r } = registryWithSpies();
    expect(handleAppCommand({ id: "nope" } as any, r).handled).toBe(false);
  });
});

describe("APP_COMMANDS config", () => {
  it("declares each dispatched id with phrases", () => {
    const ids = APP_COMMANDS.map((c) => c.id);
    for (const id of [
      "switch_tab",
      "open_panel",
      "close_panel",
      "new_order",
      "save_note",
      "confirm_dialog",
      "cancel_dialog",
    ]) {
      expect(ids).toContain(id);
    }
    for (const c of APP_COMMANDS) expect(c.phrases.length).toBeGreaterThan(0);
  });
});
