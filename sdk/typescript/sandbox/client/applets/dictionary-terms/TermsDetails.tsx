/** Details card: manage dictionary terms via the shared RuleManager. */
import { RuleManager } from "../_shared/RuleManager";
import { type Term, termStore, toExport } from "./terms";

export function TermsDetails() {
  const items = termStore.useItems();
  return (
    <RuleManager<Term>
      items={items}
      fields={[{ name: "term", label: "Term", placeholder: "e.g. metformin, HbA1c" }]}
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
