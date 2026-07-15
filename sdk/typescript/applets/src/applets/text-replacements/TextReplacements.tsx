/**
 * Applet — CONCEPT: text replacements. Configure find/replace rules (sent in the
 * dictation config as `replacements`) and dictate to see them applied to the
 * final transcript. Rules are managed in the details card below.
 */
import { useEffect, useMemo } from "react";
import { DictationField } from "../_shared/DictationField";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { buildReplacementConfig, replacementStore } from "./replacements";

const LANGUAGE = "en";

export function TextReplacements() {
  const { clientId, tenantName } = useCortiAccessToken();
  const items = replacementStore.useItems();

  useEffect(() => {
    replacementStore.setIdentity(clientId, tenantName);
  }, [clientId, tenantName]);

  const config = useMemo(
    () => buildReplacementConfig(LANGUAGE, items),
    [items],
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Text replacements
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Replacements rewrite spoken phrases in the final transcript (e.g.
          “BID” → “twice daily”). Configure the rule set below, then dictate to
          see them applied. {items.length} rules configured.
        </p>
      </div>

      <DictationField
        dictationConfig={config}
        language={LANGUAGE}
        placeholder="Dictate to see replacements applied to the final text…"
      />
    </div>
  );
}
