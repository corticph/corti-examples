/**
 * Model + store for the dictionary-terms applet. A term is a custom vocabulary
 * entry that biases recognition toward domain words (Corti `terms` config,
 * `/api-reference/transcribe#param-terms`). No published examples catalog yet,
 * so the catalog below is a small medical starter set.
 */
import type { Corti } from "@corti/sdk";
import type {
  KeytermsConfig,
  TranscribeConfiguration,
  TranscribeTerm,
} from "../_shared/types";
import { createRuleStore, type RuleBase } from "../_shared/rule-store";

export interface Term extends RuleBase {
  term: string;
}

export const CATALOG: Term[] = [
  { id: "t-Corti", term: "Corti", builtin: true },
  { id: "t-lisinopril", term: "lisinopril", builtin: true },
  { id: "t-metformin", term: "metformin", builtin: true },
  { id: "t-atorvastatin", term: "atorvastatin", builtin: true },
];

export const termStore = createRuleStore<Term>("terms.user", CATALOG);

function buildTermsPayload(
  items: Term[],
): Pick<TranscribeConfiguration, "terms" | "keyterms"> {
  const terms: TranscribeTerm[] = items.map(({ term }) => ({ term }));
  const keyterms: KeytermsConfig | undefined =
    terms.length > 0 ? { terms } : undefined;
  return { terms, keyterms };
}

/** Export in a config-object shape consistent with the other catalogs. */
export function toExport(items: Term[]) {
  return {
    type: "config",
    configuration: buildTermsPayload(items),
  };
}

/**
 * Build the dictation config in the same shape as the Transcribe endpoint tab:
 * the normalized `terms` array plus the mirrored `keyterms` wrapper used by
 * the current compatibility path.
 */
export function buildTermsConfig(
  primaryLanguage: string,
  items: Term[],
): Corti.TranscribeConfig &
  Pick<TranscribeConfiguration, "terms" | "keyterms"> {
  return {
    primaryLanguage,
    interimResults: true,
    spokenPunctuation: true,
    audioEvents: { enabled: true },
    ...buildTermsPayload(items),
  };
}
