/**
 * Applet — CONCEPT: dictionary terms (custom vocabulary). Configure domain terms
 * (sent in the dictation config as `terms`) to bias recognition, then dictate.
 * Terms are managed in the details card below.
 */
import { useEffect, useMemo } from "react";
import { DictationField } from "../_shared/DictationField";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { buildTermsConfig, termStore } from "./terms";

const LANGUAGE = "en";

export function DictionaryTerms() {
  const { clientId, tenantName } = useCortiAccessToken();
  const items = termStore.useItems();

  useEffect(() => {
    termStore.setIdentity(clientId, tenantName);
  }, [clientId, tenantName]);

  const config = useMemo(() => buildTermsConfig(LANGUAGE, items), [items]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Dictionary terms
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Terms are custom vocabulary that bias recognition toward domain words
          (drug names, acronyms, etc.). Configure the term list below, then
          dictate. {items.length} terms configured.
        </p>
      </div>

      <DictationField
        dictationConfig={config}
        language={LANGUAGE}
        placeholder="Dictate domain terms to see recognition bias…"
      />
    </div>
  );
}
