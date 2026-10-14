import { describe, expect, it, vi } from "vitest";
import { type AppControl, createAppControlRegistry } from "./appControlAdapter";

function ctrl(over: Partial<AppControl> & Pick<AppControl, "id" | "label">): AppControl {
  return { kind: "action", run: vi.fn(), ...over };
}

describe("createAppControlRegistry", () => {
  it("resolves by exact label, alias, and contains-match (filler words stripped)", () => {
    const r = createAppControlRegistry();
    r.register(ctrl({ id: "p", label: "details", aliases: ["info"] }));
    r.register(ctrl({ id: "t", label: "notes" }));
    expect(r.resolve("details")?.id).toBe("p");
    expect(r.resolve("open the details panel")?.id).toBe("p"); // filler + contains
    expect(r.resolve("info")?.id).toBe("p"); // alias
    expect(r.resolve("notes")?.id).toBe("t");
    expect(r.resolve("nonexistent")).toBeUndefined();
  });

  it("runs a resolved control and passes the arg", () => {
    const run = vi.fn();
    const r = createAppControlRegistry();
    r.register(ctrl({ id: "panel", label: "details", kind: "toggle", run }));
    const out = r.run("details", "open");
    expect(run).toHaveBeenCalledWith("open");
    expect(out.handled).toBe(true);
  });

  it("gates on isAvailable without running", () => {
    const run = vi.fn();
    const r = createAppControlRegistry();
    r.register(ctrl({ id: "confirm", label: "confirm", run, isAvailable: () => false }));
    const out = r.run("confirm");
    expect(run).not.toHaveBeenCalled();
    expect(out.handled).toBe(true);
    expect(out.description).toContain("not available");
  });

  it("reports unhandled for an unknown target", () => {
    const r = createAppControlRegistry();
    const out = r.run("ghost");
    expect(out.handled).toBe(false);
  });

  it("snapshots state + availability for the awareness panel", () => {
    let open = false;
    const r = createAppControlRegistry();
    r.register(
      ctrl({
        id: "panel",
        label: "details",
        kind: "toggle",
        getState: () => (open ? "open" : "closed"),
      }),
    );
    r.register(ctrl({ id: "save", label: "save", isAvailable: () => open }));
    expect(r.snapshot()).toEqual([
      {
        id: "panel",
        label: "details",
        kind: "toggle",
        state: "closed",
        available: true,
      },
      {
        id: "save",
        label: "save",
        kind: "action",
        state: null,
        available: false,
      },
    ]);
    open = true;
    const snap = r.snapshot();
    expect(snap[0].state).toBe("open");
    expect(snap[1].available).toBe(true);
  });

  it("unregister removes only the live registration", () => {
    const r = createAppControlRegistry();
    const off = r.register(ctrl({ id: "x", label: "x" }));
    r.register(ctrl({ id: "x", label: "x2" })); // re-register same id
    off(); // stale unregister must NOT remove the newer one
    expect(r.get("x")?.label).toBe("x2");
  });
});
