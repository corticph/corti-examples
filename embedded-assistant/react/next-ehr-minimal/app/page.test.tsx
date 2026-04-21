import { describe, expect, it } from "vitest";
import { appointmentStatusLabel, formatDate, outcomeLabel } from "@/lib/ehr-utils";

describe("ehr utils", () => {
  it("formats dates for the patient-facing summary", () => {
    expect(formatDate("2026-04-19T09:00:00")).toContain("19 Apr 2026");
  });

  it("maps outcome labels", () => {
    expect(outcomeLabel("prescription")).toBe("Prescription");
    expect(outcomeLabel("none")).toBe("Advice only");
  });

  it("maps appointment statuses", () => {
    expect(appointmentStatusLabel("checked-in")).toBe("Checked in");
  });
});
