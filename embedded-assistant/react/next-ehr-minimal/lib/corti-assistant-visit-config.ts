import type { Fact } from "@corti/embedded-web";
import { CORTI_SOAP_TEMPLATE_ID } from "@/lib/corti-soap-template";
import type { PatientSummary } from "@/lib/ehr-types";

const FACT_TEXT_LIMIT = 100;

export type CortiAssistantVisitConfig = {
  templateId: string;
  patientFacts: Fact[];
};

function truncate(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= FACT_TEXT_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(0, FACT_TEXT_LIMIT - 3).trimEnd()}...`;
}

function toFacts(values: string[]): Fact[] {
  return values.map((text) => ({ text: truncate(text), group: "other" }));
}

function buildPatientFacts(patient: PatientSummary, reason: string) {
  return toFacts([
    `Patient: ${patient.fullName}`,
    `Date of birth: ${patient.dob}`,
    `Age: ${patient.age} yrs`,
    `Gender: ${patient.sex}`,
    `Chronic conditions: ${patient.chronicConditions}`,
    `Allergies: ${patient.allergies}`,
    `Reason for visit: ${reason}`,
  ]);
}

export function buildCortiAssistantVisitConfig({
  patient,
  reason,
}: {
  patient: PatientSummary;
  reason: string;
}): CortiAssistantVisitConfig {
  return {
    templateId: CORTI_SOAP_TEMPLATE_ID,
    patientFacts: buildPatientFacts(patient, reason),
  };
}
