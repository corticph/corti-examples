/**
 * Configuration dialog for live dictation mode.
 *
 * Tabbed dialog with: Commands, Replacements, and Dictionary.
 * Reuses the same stores as the Dictation Suite (replacementStore, termStore,
 * commandStore) so config is shared across applets for the same API client.
 *
 * Formatting lives at the page level (shared between file and live tabs),
 * not in this dialog.
 */

import { Wrench } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RuleManager } from "../_shared/RuleManager";
import { cn } from "../_shared/utils";
import { CommandManager } from "../dictation-commands/CommandManager";
import {
  type Term,
  termStore,
  toExport as termsToExport,
} from "../dictionary-terms/terms";
import {
  type Replacement,
  replacementStore,
  toExport as replacementsToExport,
} from "../text-replacements/replacements";

type TabId = "commands" | "replacements" | "dictionary";

const TABS: { id: TabId; label: string }[] = [
  { id: "commands", label: "Commands" },
  { id: "replacements", label: "Replacements" },
  { id: "dictionary", label: "Dictionary" },
];

function ReplacementsPanel() {
  const items = replacementStore.useItems();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Rewrites spoken phrases in the final transcript, server-side (e.g.
        &ldquo;BID&rdquo; &rarr; &ldquo;twice daily&rdquo;).
      </p>
      <RuleManager<Replacement>
        items={items}
        fields={[
          { name: "find", label: "Find", placeholder: "BID" },
          {
            name: "replace",
            label: "Replace with",
            placeholder: "twice daily",
          },
        ]}
        describe={(item) => `${item.find} \u2192 ${item.replace}`}
        toExport={replacementsToExport}
        exportFilename="corti-replacements.json"
        noun="replacement"
        onUpsert={(item) => replacementStore.upsert(item)}
        onRemoveMany={(ids) => replacementStore.removeMany(ids)}
        newId={replacementStore.newId}
      />
    </div>
  );
}

function TermsPanel() {
  const items = termStore.useItems();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Biases recognition toward custom vocabulary, so domain words come back
        right instead of needing a replacement afterwards.
      </p>
      <RuleManager<Term>
        items={items}
        fields={[{ name: "term", label: "Term", placeholder: "lisinopril" }]}
        describe={(item) => item.term}
        toExport={termsToExport}
        exportFilename="corti-terms.json"
        noun="term"
        onUpsert={(item) => termStore.upsert(item)}
        onRemoveMany={(ids) => termStore.removeMany(ids)}
        newId={termStore.newId}
      />
    </div>
  );
}

export function LiveDictationConfig() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("commands");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Configuration"
          className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Wrench className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuration</DialogTitle>
        </DialogHeader>

        <nav className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded border px-2.5 py-1 text-xs font-medium transition-colors",
                t.id === tab
                  ? "border-lime-600 bg-lime-600/10 text-foreground dark:border-corti-lime dark:bg-corti-lime/10"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="rounded-md border border-border bg-card p-3">
          {tab === "commands" && <CommandManager stacked />}
          {tab === "replacements" && <ReplacementsPanel />}
          {tab === "dictionary" && <TermsPanel />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
