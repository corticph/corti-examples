/**
 * Model + store for the text-replacements applet. A replacement is a
 * find/replace rule applied to the final transcript (Corti `replacements`
 * config). Catalog seeded from corti-examples/dictation/replacements.
 */
import type { Corti } from "@corti/sdk";
import { createRuleStore, type RuleBase } from "../_shared/rule-store";

export interface Replacement extends RuleBase {
  find: string;
  replace: string;
}

/** Preloaded catalog (subset of corti-examples replacement sets). */
export const CATALOG: Replacement[] = [
  { id: "qd", find: "QD", replace: "once daily", builtin: true },
  { id: "bid", find: "BID", replace: "twice daily", builtin: true },
  { id: "tid", find: "TID", replace: "three times daily", builtin: true },
  { id: "prn", find: "PRN", replace: "as needed", builtin: true },
  { id: "po", find: "PO", replace: "by mouth", builtin: true },
  { id: "firstly", find: "firstly", replace: "1.", builtin: true },
  { id: "secondly", find: "secondly", replace: "2.", builtin: true },
  { id: "thirdly", find: "thirdly", replace: "3.", builtin: true },
  { id: "rn-one", find: "Roman numeral one", replace: "i", builtin: true },
  { id: "rn-two", find: "Roman numeral two", replace: "ii", builtin: true },
];

export const replacementStore = createRuleStore<Replacement>("replacements.user", CATALOG);

/** Export in the corti-examples config shape so it round-trips with the catalog. */
export function toExport(items: Replacement[]) {
  return {
    type: "config",
    configuration: {
      replacements: items.map(({ find, replace }) => ({ find, replace })),
    },
  };
}

/**
 * Build the dictation config. `replacements` is cast in because
 * `@corti/dictation-web@0.7.0`'s `TranscribeConfig` doesn't type it yet (the
 * asyncapi spec does) — drop the cast once the SDK includes it.
 */
export function buildReplacementConfig(
  primaryLanguage: string,
  items: Replacement[],
): Corti.TranscribeConfig {
  return {
    primaryLanguage,
    interimResults: true,
    spokenPunctuation: true,
    audioEvents: { enabled: true },
    replacements: items.map(({ find, replace }) => ({ find, replace })),
  } as unknown as Corti.TranscribeConfig;
}
