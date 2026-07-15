import type { Corti } from "@corti/sdk";
import type {
  KeytermsConfig,
  TranscribeConfiguration,
  TranscribeTerm,
} from "../_shared/types";
import { WAKE_COMMAND_ID } from "./model";

const WAKE_PHRASES = [
  "ok Corti {intent}",
  "okay Corti {intent}",
  "hey Corti {intent}",
  "Corti {intent}",
] as const;

const KEYTERM_WORDS = ["Corti"] as const;

export function buildConversationalConfig(
  primaryLanguage: string,
): Corti.TranscribeConfig &
  Pick<TranscribeConfiguration, "terms" | "keyterms"> {
  const terms: TranscribeTerm[] = KEYTERM_WORDS.map((term) => ({ term }));
  const keyterms: KeytermsConfig = { terms };

  return {
    primaryLanguage,
    interimResults: false,
    spokenPunctuation: true,
    automaticPunctuation: true,
    audioEvents: { enabled: true },
    terms,
    keyterms,
    commands: [
      {
        id: WAKE_COMMAND_ID,
        phrases: [...WAKE_PHRASES],
        variables: [
          {
            key: "intent",
            type: "wildcard",
          } as unknown as Corti.TranscribeCommandVariable,
        ],
      },
    ],
  };
}
