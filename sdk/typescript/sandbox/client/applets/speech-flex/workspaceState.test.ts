import { describe, expect, it } from "vitest";
import {
  ENCOUNTER_TYPE_LABELS,
  ENCOUNTER_TYPES,
  fallbackPatientName,
  type VisitItem,
  visitPatientName,
} from "./workspaceState";

function makeVisit(overrides: Partial<VisitItem> = {}): VisitItem {
  return {
    interactionId: "int-1",
    encounter: {
      identifier: "enc-1",
      status: "in-progress",
      type: "consultation",
      period: { startedAt: "2026-01-01T10:00:00Z" },
    },
    createdAt: "2026-01-01T09:00:00Z",
    ...overrides,
  };
}

describe("fallbackPatientName", () => {
  it("is deterministic for the same interaction id", () => {
    expect(fallbackPatientName("int-42")).toBe(fallbackPatientName("int-42"));
  });

  it("returns a name of the shape 'First X. Last'", () => {
    const name = fallbackPatientName("int-1");
    const [first, initial, last] = name.split(" ");
    expect(first).toMatch(/^[A-Z]/);
    expect(initial).toMatch(/^[A-Z]\.$/);
    expect(last).toMatch(/^[A-Z]/);
  });

  it("distributes names across many ids", () => {
    const names = Array.from({ length: 200 }, (_, i) => fallbackPatientName(`int-${i}`));
    // 200 draws from 40 × 26 × 40 name slots expect ~199 distinct names;
    // require at least 150 to keep the property test robust to rare collisions.
    expect(new Set(names).size).toBeGreaterThanOrEqual(150);
  });
});

describe("visitPatientName", () => {
  it("prefers the recorded patient name", () => {
    const visit = makeVisit({
      patient: { identifier: "p1", name: "Ada Lovelace" },
    });
    expect(visitPatientName(visit)).toBe("Ada Lovelace");
  });

  it("falls back to the encounter title when there is no patient name", () => {
    const visit = makeVisit({
      patient: { identifier: "p1", name: null },
      encounter: {
        identifier: "enc-1",
        status: "in-progress",
        type: "consultation",
        period: { startedAt: "2026-01-01T10:00:00Z" },
        title: "Follow-up visit",
      },
    });
    expect(visitPatientName(visit)).toBe("Follow-up visit");
  });

  it("falls back to the deterministic name when patient and title are missing", () => {
    const visit = makeVisit({ interactionId: "int-99" });
    expect(visitPatientName(visit)).toBe(fallbackPatientName("int-99"));
  });
});

describe("encounter constants", () => {
  it("has a label for every encounter type", () => {
    expect(ENCOUNTER_TYPES.every((t) => t in ENCOUNTER_TYPE_LABELS)).toBe(true);
    expect(Object.keys(ENCOUNTER_TYPE_LABELS)).toHaveLength(ENCOUNTER_TYPES.length);
  });
});
