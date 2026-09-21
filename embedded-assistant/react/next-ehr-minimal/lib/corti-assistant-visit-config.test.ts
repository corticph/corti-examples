import { describe, expect, it } from "vitest";
import { buildCortiAssistantVisitConfig } from "@/lib/corti-assistant-visit-config";
import { CORTI_SOAP_TEMPLATE_ID } from "@/lib/corti-soap-template";
import type { PatientSummary } from "@/lib/ehr-types";

const patient: PatientSummary = {
  id: 1,
  fullName: "Alex Morgan",
  dob: "1988-03-14",
  age: 38,
  sex: "female",
  phone: "020 7946 0000",
  email: "alex@example.test",
  address: "1 Harbour Road",
  nhsNumber: "485 777 3456",
  allergies: "Penicillin",
  chronicConditions: "Asthma",
  lastRecordAt: null,
  nextAppointmentAt: null,
};

describe("corti assistant visit config", () => {
  it("uses the fixed schema-driven SOAP template", () => {
    const config = buildCortiAssistantVisitConfig({
      patient,
      reason: "Annual checkup",
    });

    expect(config.templateId).toBe(CORTI_SOAP_TEMPLATE_ID);
  });

  it("builds patient context facts", () => {
    const config = buildCortiAssistantVisitConfig({
      patient,
      reason: "Annual checkup",
    });

    expect(config.patientFacts).toHaveLength(7);
    expect(config.patientFacts).toContainEqual({ text: "Patient: Alex Morgan", group: "other" });
    expect(config.patientFacts).toContainEqual({ text: "Reason for visit: Annual checkup", group: "other" });
  });
});
