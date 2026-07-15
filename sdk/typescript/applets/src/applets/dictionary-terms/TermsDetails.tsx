/** Details card: manage dictionary terms via the shared RuleManager. */
import { RuleManager } from "../_shared/RuleManager";
import { termStore, toExport, type Term } from "./terms";

export function TermsDetails() {
  const items = termStore.useItems();
  return (
    <RuleManager<Term>
      items={items}
      fields={[
        { name: "term", label: "Term", placeholder: "e.g. metformin, HbA1c" },
      ]}
      describe={(t) => t.term}
      toExport={toExport}
      exportFilename="corti-terms.json"
      noun="term"
      onUpsert={termStore.upsert}
      onRemoveMany={termStore.removeMany}
      newId={termStore.newId}
    />
  );
}
