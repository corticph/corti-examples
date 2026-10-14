/**
 * The single dictation config for the whole suite.
 *
 * In the upstream sandbox each applet built its own `TranscribeConfig` in
 * isolation, so replacements, dictionary terms and commands could never be
 * active at the same time. Here there is one editor and one microphone, so
 * there is one config: every feature contributes its slice and they are merged
 * before the socket opens.
 *
 * All three extras are declared server-side in the config (not applied
 * client-side after the fact):
 *   - `replacements` rewrite phrases in the final transcript
 *   - `terms` / `keyterms` bias recognition toward custom vocabulary
 *   - `commands` make the server emit a `command` event on a phrase match
 */
import type { Corti } from "@corti/sdk";
import { buildFormattingOverrides } from "../_shared/formatting";
import type {
  FormattingConfig,
  KeytermsConfig,
  TranscribeTerm,
} from "../_shared/types";
import type { Term } from "../dictionary-terms/terms";
import type { Replacement } from "../text-replacements/replacements";

export interface SuiteConfigInput {
  replacements: Replacement[];
  terms: Term[];
  commands: Corti.TranscribeCommand[];
  formatting?: FormattingConfig;
}

/**
 * `terms` (flat array) is cast because SDK v6's `TranscribeConfig` types
 * `keyterms` (wrapped) but not the flat `terms` field, even though the server
 * accepts both. Drop the cast once the SDK adds `terms` to the type.
 */
export function buildSuiteConfig(
  primaryLanguage: string,
  { replacements, terms, commands, formatting }: SuiteConfigInput,
): Corti.TranscribeConfig {
  const termPayload: TranscribeTerm[] = terms.map(({ term }) => ({ term }));
  const keyterms: KeytermsConfig | undefined =
    termPayload.length > 0 ? { terms: termPayload } : undefined;

  const formattingOverrides = formatting
    ? buildFormattingOverrides(formatting)
    : undefined;

  return {
    primaryLanguage,
    interimResults: true,
    spokenPunctuation: true,
    audioEvents: { enabled: true },
    commands,
    ...(formattingOverrides ? { formatting: formattingOverrides } : {}),
    replacements: replacements.map(({ find, replace }) => ({ find, replace })),
    terms: termPayload,
    keyterms,
  } as unknown as Corti.TranscribeConfig;
}
