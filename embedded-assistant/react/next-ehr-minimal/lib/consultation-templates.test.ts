import { describe, expect, it } from "vitest";
import {
  getConsultationFormEntryTypes,
  getConsultationTemplate,
} from "@/lib/consultation-templates";

describe("consultation templates", () => {
  it("keeps maternity entries pre-natal only", () => {
    expect(getConsultationTemplate("annual-checkup").defaultEntryTypes).not.toContain(
      "maternity",
    );
    expect(getConsultationFormEntryTypes("annual-checkup")).not.toContain(
      "maternity",
    );
    expect(getConsultationFormEntryTypes("prenatal")).toContain("maternity");
  });
});