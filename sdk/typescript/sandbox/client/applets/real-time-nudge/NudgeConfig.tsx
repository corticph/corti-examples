/**
 * NudgeConfig — configuration dialog for the Real-time nudge applet.
 *
 * Tabbed dialog with: Commands, Replacements, Dictionary, and Formatting.
 * Reuses the same stores as the Dictation Suite (replacementStore,
 * termStore, commandStore) so config is shared across applets for the
 * same API client.
 *
 * Same pattern as SpeechFlexConfig, minus the ambient-specific tabs.
 */

import { Check, Wrench } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  type Replacement,
  replacementStore,
  toExport as replacementsToExport,
} from "../text-replacements/replacements";

const SETTINGS_KEY = "real-time-nudge.settings";

export interface NudgeSettings {
  formatting: FormattingConfig;
  snomedEnabled: boolean;
  /** Whether ICD-10-CM code prediction is enabled. */
  icd10Enabled: boolean;
  /** Whether agent-assisted SNOMED/ICD-10 evaluation is enabled. */
  agentEnabled: boolean;
  /** Whether to cache agent results (for testing, can be disabled). */
  agentCached: boolean;
}

const DEFAULT_SETTINGS: NudgeSettings = {
  formatting: { ...DEFAULT_FORMATTING },
  snomedEnabled: false,
  icd10Enabled: false,
  agentEnabled: false,
  agentCached: true,
};

function loadSettings(): NudgeSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: NudgeSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

type TabId = "commands" | "replacements" | "dictionary" | "formatting" | "snomed";

const TABS: { id: TabId; label: string }[] = [
  { id: "commands", label: "Commands" },
  { id: "replacements", label: "Replacements" },
  { id: "dictionary", label: "Dictionary" },
  { id: "formatting", label: "Formatting" },
  { id: "snomed", label: "Code systems" },
];

function ReplacementsPanel() {
  const items = replacementStore.useItems();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Rewrites spoken phrases in the final transcript, server-side (e.g. "BID" &rarr; "twice
        daily").
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
  settings: NudgeSettings;
  onChange: (s: NudgeSettings) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Controls how dates, times, numbers, measurements, and ordinals appear in transcript output.
      </p>
      <div className="grid grid-cols-[140px_auto] grid-rows-6 items-center gap-x-3 gap-y-2">
        {FORMATTING_FIELD_LABELS.map(({ key, label }) => (
          <div key={key} className="contents">
            <label htmlFor={`fmt-${key}`} className="text-sm font-medium text-foreground">
              {label}
            </label>
            <select
              id={`fmt-${key}`}
              value={settings.formatting[key]}
              onChange={(e) => {
                const next = {
                  ...settings,
                  formatting: { ...settings.formatting, [key]: e.target.value },
                };
                saveSettings(next);
                onChange(next);
              }}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {FORMATTING_OPTIONS[key].map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          const next = { ...settings, formatting: { ...DEFAULT_FORMATTING } };
          saveSettings(next);
          onChange(next);
        }}
        className="mt-1 self-start rounded border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Reset to defaults
      </button>
    </div>
  );
}

function SnomedPanel({
  settings,
  onChange,
  predictError,
  agentError,
}: {
  settings: NudgeSettings;
  onChange: (s: NudgeSettings) => void;
  predictError?: string | null;
  agentError?: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* SNOMED predict toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">SNOMED-CT code prediction</span>
          <span className="text-xs text-muted-foreground">
            Enable SNOMED-CT code prediction via the Corti API to evaluate SNOMED-based nudge rules.
            Each predict call consumes credits. When disabled, only text-based rules are evaluated
            (no API calls).
          </span>
        </div>
        <div
          className={cn(
            "flex h-5 w-9 items-center rounded-full transition-colors",
            settings.snomedEnabled ? "bg-lime-600 dark:bg-corti-lime" : "bg-muted",
          )}
        >
          <button
            type="button"
            role="switch"
            aria-checked={settings.snomedEnabled}
            onClick={() => {
              const next = { ...settings, snomedEnabled: !settings.snomedEnabled };
              saveSettings(next);
              onChange(next);
            }}
            className={cn(
              "ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white transition-transform",
              settings.snomedEnabled && "translate-x-4",
            )}
          >
            {settings.snomedEnabled && <Check className="h-2.5 w-2.5 text-foreground" />}
          </button>
        </div>
      </div>

      {settings.snomedEnabled && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            SNOMED-CT prediction is in Beta and consumes API credits per call. Calls are cached by
            unchanged inputs for up to five minutes, with one active prediction at a time.
          </p>
        </div>
      )}

      {/* ICD-10-CM predict toggle */}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">ICD-10-CM code prediction</span>
          <span className="text-xs text-muted-foreground">
            Enable ICD-10-CM (outpatient) code prediction via the Corti API to evaluate ICD-10-based
            nudge rules. Each predict call consumes credits. Can be enabled independently from
            SNOMED-CT.
          </span>
        </div>
        <div
          className={cn(
            "flex h-5 w-9 items-center rounded-full transition-colors",
            settings.icd10Enabled ? "bg-lime-600 dark:bg-corti-lime" : "bg-muted",
          )}
        >
          <button
            type="button"
            role="switch"
            aria-checked={settings.icd10Enabled}
            onClick={() => {
              const next = { ...settings, icd10Enabled: !settings.icd10Enabled };
              saveSettings(next);
              onChange(next);
            }}
            className={cn(
              "ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white transition-transform",
              settings.icd10Enabled && "translate-x-4",
            )}
          >
            {settings.icd10Enabled && <Check className="h-2.5 w-2.5 text-foreground" />}
          </button>
        </div>
      </div>

      {settings.icd10Enabled && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            ICD-10-CM prediction is in Beta and consumes API credits per call. Calls are cached by
            unchanged inputs for up to five minutes, with one active prediction at a time. When both
            SNOMED and ICD-10 are enabled, they are batched in a single predict call (unfiltered).
          </p>
        </div>
      )}

      {/* Agent evaluation toggle */}
      {(settings.snomedEnabled || settings.icd10Enabled) && (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              Agent-assisted evaluation (Beta)
            </span>
            <span className="text-xs text-muted-foreground">
              Uses a Corti Agentic Framework agent to evaluate SNOMED and ICD-10 rules with
              hierarchy-aware reasoning (is-a / descendent-of) and contextual awareness (negation,
              family history, ruled-out conditions). Without this, SNOMED rules use basic
              client-side code matching.
            </span>
          </div>
          <div
            className={cn(
              "flex h-5 w-9 items-center rounded-full transition-colors",
              settings.agentEnabled ? "bg-lime-600 dark:bg-corti-lime" : "bg-muted",
            )}
          >
            <button
              type="button"
              role="switch"
              aria-checked={settings.agentEnabled}
              onClick={() => {
                const next = { ...settings, agentEnabled: !settings.agentEnabled };
                saveSettings(next);
                onChange(next);
              }}
              className={cn(
                "ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white transition-transform",
                settings.agentEnabled && "translate-x-4",
              )}
            >
              {settings.agentEnabled && <Check className="h-2.5 w-2.5 text-foreground" />}
            </button>
          </div>
        </div>
      )}

      {/* Cache toggle */}
      <div className="flex items-center justify-between gap-3 pl-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-foreground">Cache agent results</span>
          <span className="text-xs text-muted-foreground">
            Reuses successful evaluations of unchanged inputs for up to five minutes. Disable to
            request fresh results. Identical pending requests still share one call.
          </span>
        </div>
        <div
          className={cn(
            "flex h-5 w-9 items-center rounded-full transition-colors",
            settings.agentCached ? "bg-lime-600 dark:bg-corti-lime" : "bg-muted",
          )}
        >
          <button
            type="button"
            role="switch"
            aria-checked={settings.agentCached}
            onClick={() => {
              const next = { ...settings, agentCached: !settings.agentCached };
              saveSettings(next);
              onChange(next);
            }}
            className={cn(
              "ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white transition-transform",
              settings.agentCached && "translate-x-4",
            )}
          >
            {settings.agentCached && <Check className="h-2.5 w-2.5 text-foreground" />}
          </button>
        </div>
      </div>

      {(settings.snomedEnabled || settings.icd10Enabled) && predictError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2">
          <p className="text-xs font-medium text-red-700 dark:text-red-400">Last predict error</p>
          <p className="mt-0.5 text-xs text-red-600 dark:text-red-300">{predictError}</p>
        </div>
      )}

      {(settings.snomedEnabled || settings.icd10Enabled) && settings.agentEnabled && agentError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2">
          <p className="text-xs font-medium text-red-700 dark:text-red-400">Last agent error</p>
          <p className="mt-0.5 text-xs text-red-600 dark:text-red-300">{agentError}</p>
        </div>
      )}
    </div>
  );
}

export function NudgeConfig({
  settings,
  onSettingsChange,
  predictError,
  agentError,
}: {
  settings: NudgeSettings;
  onSettingsChange: (s: NudgeSettings) => void;
  predictError?: string | null;
  agentError?: string | null;
}) {
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
          {tab === "formatting" && (
            <FormattingPanel settings={settings} onChange={onSettingsChange} />
          )}
          {tab === "snomed" && (
            <SnomedPanel
              settings={settings}
              onChange={onSettingsChange}
              predictError={predictError}
              agentError={agentError}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { loadSettings, saveSettings };
