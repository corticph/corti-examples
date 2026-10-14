import { afterEach, describe, expect, it } from "vitest";
import {
  _dispatchCommand,
  type CommandCatalog,
  clearAllOverrides,
  deviceStore,
  registerCommandCatalog,
  registerCommandHandler,
  setActiveApplet,
  setButtonOverride,
  setGlobalMappings,
  setStoreError,
} from "./dictationDevice";
import { BUTTON_BIT, type ButtonMappings } from "./hidRecording";

const { RECORD, F1 } = BUTTON_BIT;

/**
 * Reset the store between tests so each starts from a clean singleton. We
 * can't re-create the module (it's a singleton), but we can reset every
 * piece of state the tests touch.
 */
function resetStore() {
  setGlobalMappings({ [RECORD]: { type: "toggle" } });
  setActiveApplet(null);
  setStoreError(null);
}

afterEach(() => {
  resetStore();
});

describe("two-layer mapping model", () => {
  describe("global mappings", () => {
    it("stores global mappings in the snapshot", () => {
      const mappings: ButtonMappings = { [F1]: { type: "push" } };
      setGlobalMappings(mappings);
      const snap = deviceStore.getSnapshot();
      expect(snap.globalMappings).toEqual(mappings);
      expect(snap.mappings).toEqual(mappings);
    });

    it("effective mappings equal global when no overrides", () => {
      const mappings: ButtonMappings = {
        [RECORD]: { type: "toggle" },
        [F1]: { type: "push" },
      };
      setGlobalMappings(mappings);
      expect(deviceStore.getSnapshot().mappings).toEqual(mappings);
    });
  });

  describe("overrides", () => {
    it("override shadows global for the same button", () => {
      setGlobalMappings({ [RECORD]: { type: "toggle" } });
      setActiveApplet("test-applet", {});
      setButtonOverride(RECORD, { type: "push" });
      const snap = deviceStore.getSnapshot();
      expect(snap.mappings[RECORD]).toEqual({ type: "push" });
      expect(snap.globalMappings[RECORD]).toEqual({ type: "toggle" });
      expect(snap.overrideBits).toContain(RECORD);
    });

    it("buttons without override fall back to global", () => {
      setGlobalMappings({
        [RECORD]: { type: "toggle" },
        [F1]: { type: "push" },
      });
      setActiveApplet("test-applet", {});
      setButtonOverride(RECORD, { type: "command", commandId: "delete_that" });
      const snap = deviceStore.getSnapshot();
      expect(snap.mappings[RECORD]).toEqual({
        type: "command",
        commandId: "delete_that",
      });
      expect(snap.mappings[F1]).toEqual({ type: "push" });
    });

    it("clearing an override falls back to global", () => {
      setGlobalMappings({ [RECORD]: { type: "toggle" } });
      setActiveApplet("test-applet", {});
      setButtonOverride(RECORD, { type: "push" });
      setButtonOverride(RECORD, null);
      const snap = deviceStore.getSnapshot();
      expect(snap.mappings[RECORD]).toEqual({ type: "toggle" });
      expect(snap.overrideBits).not.toContain(RECORD);
    });

    it("clearAllOverrides resets all overrides", () => {
      setGlobalMappings({
        [RECORD]: { type: "toggle" },
        [F1]: { type: "push" },
      });
      setActiveApplet("test-applet", {});
      setButtonOverride(RECORD, { type: "command", commandId: "a" });
      setButtonOverride(F1, { type: "command", commandId: "b" });
      expect(deviceStore.getSnapshot().overrideBits.length).toBe(2);
      clearAllOverrides();
      const snap = deviceStore.getSnapshot();
      expect(snap.overrideBits).toEqual([]);
      expect(snap.mappings).toEqual({
        [RECORD]: { type: "toggle" },
        [F1]: { type: "push" },
      });
    });

    it("deactivating applet clears overrides from memory", () => {
      setGlobalMappings({ [RECORD]: { type: "toggle" } });
      setActiveApplet("test-applet", {});
      setButtonOverride(RECORD, { type: "push" });
      expect(deviceStore.getSnapshot().mappings[RECORD]).toEqual({
        type: "push",
      });
      setActiveApplet(null);
      const snap = deviceStore.getSnapshot();
      expect(snap.mappings[RECORD]).toEqual({ type: "toggle" });
      expect(snap.overrideBits).toEqual([]);
      expect(snap.activeAppletId).toBeNull();
    });
  });
});

describe("command catalog", () => {
  it("registerCommandCatalog sets activeCatalog", () => {
    const catalog: CommandCatalog = {
      appletId: "test",
      commands: [{ id: "delete_that", label: "delete_that" }],
    };
    const unregister = registerCommandCatalog(catalog);
    expect(deviceStore.getSnapshot().activeCatalog).toBe(catalog);
    unregister();
    expect(deviceStore.getSnapshot().activeCatalog).toBeNull();
  });

  it("most-recently registered catalog wins", () => {
    const a: CommandCatalog = { appletId: "a", commands: [] };
    const b: CommandCatalog = { appletId: "b", commands: [] };
    const unA = registerCommandCatalog(a);
    const unB = registerCommandCatalog(b);
    expect(deviceStore.getSnapshot().activeCatalog?.appletId).toBe("b");
    unB();
    expect(deviceStore.getSnapshot().activeCatalog?.appletId).toBe("a");
    unA();
  });
});

describe("dispatchCommand error surfacing", () => {
  it("surfaces error when no handler is registered", () => {
    _dispatchCommand("delete_that");
    const snap = deviceStore.getSnapshot();
    expect(snap.error).toContain("No command handler");
    expect(snap.error).toContain("delete_that");
  });

  it("surfaces error when command is not in active catalog", () => {
    let received: string | null = null;
    const unHandler = registerCommandHandler((id) => {
      received = id;
    });
    const unCatalog = registerCommandCatalog({
      appletId: "test",
      commands: [{ id: "delete_that", label: "delete_that" }],
    });
    _dispatchCommand("switch_tab");
    expect(received).toBeNull();
    expect(deviceStore.getSnapshot().error).toContain("not available");
    expect(deviceStore.getSnapshot().error).toContain("switch_tab");
    unHandler();
    unCatalog();
  });

  it("dispatches when command is in catalog", () => {
    let received: string | null = null;
    const unHandler = registerCommandHandler((id) => {
      received = id;
    });
    const unCatalog = registerCommandCatalog({
      appletId: "test",
      commands: [{ id: "delete_that", label: "delete_that" }],
    });
    _dispatchCommand("delete_that");
    expect(received).toBe("delete_that");
    expect(deviceStore.getSnapshot().error).toBeNull();
    unHandler();
    unCatalog();
  });

  it("dispatches when no catalog is registered (backward compatible)", () => {
    let received: string | null = null;
    const unHandler = registerCommandHandler((id) => {
      received = id;
    });
    _dispatchCommand("anything");
    expect(received).toBe("anything");
    unHandler();
  });
});
