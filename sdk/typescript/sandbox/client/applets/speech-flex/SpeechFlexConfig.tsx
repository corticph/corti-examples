/**
 * SpeechFlexConfig — configuration dialog for the Speech Flex applet.
 *
 * Tabbed dialog with: Commands, Replacements, Dictionary, Cleanup prompt,
 * Formatting (dates, times, numbers, measurements, ordinals), and Facts
 * (facts extraction toggle).
 *
 * Reuses the same stores as the Dictation Suite applet (replacementStore,
 * termStore, commandStore, promptStore) so config is shared across applets
 * for the same API client.
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
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_FORMATTING,
  FORMATTING_FIELD_LABELS,
  FORMATTING_OPTIONS,
} from "../_shared/formatting";
import { RuleManager } from "../_shared/RuleManager";
import type { FormattingConfig } from "../_shared/types";
import { cn } from "../_shared/utils";
import { CommandManager } from "../dictation-commands/CommandManager";
import { type Term, termStore, toExport as termsToExport } from "../dictionary-terms/terms";
import { CleanupPromptLibrary } from "../on-demand-agent/CleanupPromptLibrary";
import {
  type Replacement,
  replacementStore,
  toExport as replacementsToExport,
} from "../text-replacements/replacements";

export type DocumentSource = "combined" | "interaction" | "text" | "transcript" | "facts";

export interface SpeechFlexSettings {
  factsEnabled: boolean;
  showInteractionSource: boolean;
  documentSource: DocumentSource;
  formatting: FormattingConfig;
}

const SETTINGS_KEY = "speech-flex.settings";

function loadSettings(): SpeechFlexSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SpeechFlexSettings>;
      return {
        factsEnabled: parsed.factsEnabled ?? true,
        showInteractionSource: parsed.showInteractionSource ?? false,
        documentSource: parsed.documentSource ?? "transcript",
        formatting: { ...DEFAULT_FORMATTING, ...parsed.formatting },
      };
    }
  } catch {
    // ignore
  }
  return {
    factsEnabled: true,
    showInteractionSource: false,
    documentSource: "transcript",
    formatting: { ...DEFAULT_FORMATTING },
  };
}

function saveSettings(s: SpeechFlexSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

type TabId = "commands" | "replacements" | "dictionary" | "cleanup" | "formatting" | "facts";

const TABS: { id: TabId; label: string }[] = [
  { id: "commands", label: "Commands" },
  { id: "replacements", label: "Replacements" },
  { id: "dictionary", label: "Dictionary" },
  { id: "cleanup", label: "Cleanup" },
  { id: "formatting", label: "Formatting" },
  { id: "facts", label: "Facts" },
];

function ReplacementsPanel() {
  const items = replacementStore.useItems();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Rewrites spoken phrases in the final transcript, server-side (e.g. "BID" → "twice daily").
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
        describe={(item) => `${item.find} → ${item.replace}`}
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
        Biases recognition toward custom vocabulary, so domain words come back right instead of
        needing a replacement afterwards.
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

function FormattingPanel({
  settings,
  onChange,
}: {
  settings: SpeechFlexSettings;
  onChange: (s: SpeechFlexSettings) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Controls how dates, times, numbers, measurements, and ordinals appear in transcript output.
        Applies to both dictation and ambient modes.
      </p>
      <div className="grid grid-cols-[140px_auto] grid-rows-6 items-center gap-x-3 gap-y-2">
        {FORMATTING_FIELD_LABELS.map(({ key, label }) => (
          <>
            <label
              key={`${key}-label`}
              htmlFor={`sf-fmt-${key}`}
              className="text-sm font-medium text-foreground"
            >
              {label}
            </label>
            <select
              key={key}
              id={`sf-fmt-${key}`}
              value={settings.formatting[key]}
              onChange={(e) =>
                onChange({
                  ...settings,
                  formatting: { ...settings.formatting, [key]: e.target.value },
                })
              }
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {FORMATTING_OPTIONS[key].map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange({ ...settings, formatting: { ...DEFAULT_FORMATTING } })}
        className="mt-1 self-start rounded border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Reset to defaults
      </button>
    </div>
  );
}

function FactsPanel({
  settings,
  onChange,
}: {
  settings: SpeechFlexSettings;
  onChange: (s: SpeechFlexSettings) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">Facts extraction</span>
          <span className="text-xs text-muted-foreground">
            Enable real-time facts extraction during ambient recording. When disabled, ambient mode
            uses transcription-only mode and the "Facts only" source is hidden in the note
            generation panel.
          </span>
        </div>
        <Switch
          checked={settings.factsEnabled}
          onCheckedChange={(checked) => onChange({ ...settings, factsEnabled: checked })}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">Interaction source</span>
          <span className="text-xs text-muted-foreground">
            Show the "Interaction (server-side)" option in the note generation source dropdown. Uses
            persisted transcripts and facts from the server instead of browser context.
          </span>
        </div>
        <Switch
          checked={settings.showInteractionSource}
          onCheckedChange={(checked) => onChange({ ...settings, showInteractionSource: checked })}
        />
      </div>
    </div>
  );
}

export function SpeechFlexConfig({
  settings,
  onSettingsChange,
}: {
  settings: SpeechFlexSettings;
  onSettingsChange: (s: SpeechFlexSettings) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("commands");

  const handleSettingsChange = (s: SpeechFlexSettings) => {
    saveSettings(s);
    onSettingsChange(s);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Configuration"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[5px] border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Wrench className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuration</DialogTitle>
        </DialogHeader>

        {/* Tab nav */}
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

        {/* Tab content */}
        <div className="rounded-md border border-border bg-card p-3">
          {tab === "commands" && <CommandManager stacked />}
          {tab === "replacements" && <ReplacementsPanel />}
          {tab === "dictionary" && <TermsPanel />}
          {tab === "cleanup" && <CleanupPromptLibrary />}
          {tab === "formatting" && (
            <FormattingPanel settings={settings} onChange={handleSettingsChange} />
          )}
          {tab === "facts" && <FactsPanel settings={settings} onChange={handleSettingsChange} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { loadSettings, saveSettings };
