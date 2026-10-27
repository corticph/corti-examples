/**
 * @vitest-environment jsdom
 *
 * Registry invariants the standalone fullscreen route depends on.
 * AppletFullscreen resolves `/:workflow/:applet/fullscreen` params via
 * getAppletByPath(workflow, applet), so a duplicate id or a workflow/id
 * mismatch would render the wrong applet — or 404 a working link.
 */
import { describe, expect, it } from "vitest";
import {
  APPLETS,
  type AppletDefinition,
  getAppletByPath,
  hasFullscreenRoute,
  workflowSlug,
} from "./registry";

/** Minimal AppletDefinition carrying only the placement under test. */
function placementOnly(placement: AppletDefinition["demoPlacement"]): AppletDefinition {
  return { demoPlacement: placement } as unknown as AppletDefinition;
}

describe("hasFullscreenRoute", () => {
  it("is false for applets without a fullscreen route", () => {
    expect(hasFullscreenRoute(placementOnly(undefined))).toBe(false);
    expect(hasFullscreenRoute(placementOnly("embedded"))).toBe(false);
  });

  it("is true for fullscreen and both placements", () => {
    expect(hasFullscreenRoute(placementOnly("fullscreen"))).toBe(true);
    expect(hasFullscreenRoute(placementOnly("both"))).toBe(true);
  });
});

describe("applet registry", () => {
  it("has unique applet ids", () => {
    const ids = APPLETS.map((applet) => applet.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves every fullscreen-capable applet from its route params", () => {
    const fullscreenCapable = APPLETS.filter(hasFullscreenRoute);
    expect(fullscreenCapable.length).toBeGreaterThan(0);
    for (const applet of fullscreenCapable) {
      expect(getAppletByPath(workflowSlug(applet.workflow), applet.id)).toBe(applet);
    }
  });
});
