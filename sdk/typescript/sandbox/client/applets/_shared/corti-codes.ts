/**
 * Shared constants and helpers for the medical coding applets
 * (`client.codes.predict`). Kept separate from `_shared/cortiAgent.ts` since
 * coding is a plain REST resource, not the Agentic Framework.
 */
import type { Corti } from "@corti/sdk";

export const CODING_SYSTEMS: Corti.CommonCodingSystemEnum[] = [
  "icd10cm-outpatient",
  "icd10cm-inpatient",
  "icd10pcs",
  "cpt",
];

/** Every coding system the API supports, for pickers that offer the full set. */
export const ALL_CODING_SYSTEMS: Corti.CommonCodingSystemEnum[] = [
  "icd10cm-outpatient",
  "icd10cm-inpatient",
  "icd10pcs",
  "cpt",
  "icd10int-outpatient",
  "icd10int-inpatient",
  "icd10uk-outpatient",
  "icd10uk-inpatient",
  "cim10fr-outpatient",
  "cim10fr-inpatient",
  "icd10gm-outpatient",
  "icd10gm-inpatient",
  "opcs4",
  "ops",
  "ccam",
];

/** Human-friendly error message with guidance for a 403 response. */
export function describeCodesError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/403|forbidden/i.test(message)) {
    return "Coding request failed (403). Verify the token scope, tenant, and environment.";
  }
  return message;
}
