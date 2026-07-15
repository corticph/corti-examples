/** Details card: manage replacement rules via the shared RuleManager. */
import { RuleManager } from "../_shared/RuleManager";
import { replacementStore, toExport, type Replacement } from "./replacements";

export function ReplacementsDetails() {
  const items = replacementStore.useItems();
  return (
    <RuleManager<Replacement>
      items={items}
      fields={[
        { name: "find", label: "Find", placeholder: "spoken phrase, e.g. BID" },
        {
          name: "replace",
          label: "Replace with",
          placeholder: "output text, e.g. twice daily",
        },
      ]}
      describe={(r) => `${r.find} → ${r.replace}`}
      toExport={toExport}
      exportFilename="corti-replacements.json"
      noun="replacement"
      onUpsert={replacementStore.upsert}
      onRemoveMany={replacementStore.removeMany}
      newId={replacementStore.newId}
    />
  );
}
