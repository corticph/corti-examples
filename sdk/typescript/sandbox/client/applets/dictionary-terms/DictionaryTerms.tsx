/**
 * Applet — CONCEPT: dictionary terms (custom vocabulary). Configure domain terms
 * (sent in the dictation config as `terms`) to bias recognition, then dictate.
 * Terms are managed in the details card below.
 */
import { useEffect, useMemo } from "react";
import { DictationField } from "../_shared/DictationField";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useDictationLanguage } from "../_shared/useDictationLanguage";
import { buildTermsConfig, termStore } from "./terms";

export function DictionaryTerms() {
  const { clientId, tenantName } = useCortiAccessToken();
  const { language } = useDictationLanguage();
  const items = termStore.useItems();

  useEffect(() => {
    termStore.setIdentity(clientId, tenantName);
  }, [clientId, tenantName]);

  const config = useMemo(() => buildTermsConfig(language, items), [language, items]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Dictionary terms</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Speech recognition can struggle with new terminology, unique accents, and dialects.
          Dictionary terms bias the model toward the words you care about. Configure the list below,
          then dictate. {items.length} terms configured.
        </p>
      </div>

      <DictationField
        dictationConfig={config}
        placeholder="Dictate domain terms to see recognition bias…"
      />
    </div>
  );
}
