/**
 * The suite's configuration sidebar: one tab per feature, all of them editing
 * stores that feed the single dictation config.
 *
 * Every panel is an existing component embedded as-is — the command and
 * microphone device managers and the cleanup prompt library all take no props and read
 * their own stores; replacements and dictionary terms drive the shared
 * RuleManager. Only the archive panel is specific to this applet, because it
 * renders the parallel recorder's state (see useParallelArchive).
 */
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AudioArchiveListItem } from "../_shared/audioArchive";
import { RuleManager } from "../_shared/RuleManager";
import { cn, formatBytes, formatDuration } from "../_shared/utils";
import { DeviceButtons } from "../device-buttons/DeviceButtons";
import { CommandManager } from "../dictation-commands/CommandManager";
import { type Term, termStore, toExport as termsToExport } from "../dictionary-terms/terms";
import { FormattingFields } from "../formatting/FormattingDialog";
import { useFormattingConfig } from "../formatting/formattingStore";
import { CleanupPromptLibrary } from "../on-demand-agent/CleanupPromptLibrary";
import {
  type Replacement,
  replacementStore,
  toExport as replacementsToExport,
} from "../text-replacements/replacements";
import { PANELS, type PanelId } from "./suiteControls";

function ReplacementsPanel() {
  const items = replacementStore.useItems();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Rewrites spoken phrases in the final transcript, server-side (e.g. “BID” → “twice daily”).
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

function FormattingPanel() {
  const { config, setConfig, reset } = useFormattingConfig();

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Controls how dates, times, numbers, measurements, and ordinals appear in the transcript.
        Changes apply on the next recording session.
      </p>
      <FormattingFields value={config} onChange={setConfig} onReset={reset} />
    </div>
  );
}

interface ArchiveView {
  archives: AudioArchiveListItem[];
  activeArchive: unknown;
  error: string | null;
  captureError: string | null;
  removeArchive: (id: string) => Promise<void>;
  clearArchives: () => Promise<void>;
}

function ArchivePanel({
  archive,
  enabled,
  onEnabledChange,
}: {
  archive: ArchiveView;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="mt-0.5 shrink-0 accent-corti-lime"
        />
        <span className="text-xs text-muted-foreground">
          Save a local copy of the microphone audio while dictating. This opens a second capture of
          the same device alongside the one being streamed, so the saved take matches what you said
          but is not byte-identical to the transmitted audio.
        </span>
      </label>

      {archive.captureError && (
        <p className="text-xs text-red-600 dark:text-red-400">{archive.captureError}</p>
      )}
      {archive.error && <p className="text-xs text-red-600 dark:text-red-400">{archive.error}</p>}

      {archive.archives.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recordings saved yet.</p>
      ) : (
        <>
          <ul className="flex max-h-80 flex-col gap-2 overflow-auto">
            {archive.archives.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-1.5 rounded-md border border-border bg-background p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDuration(item.durationMs)} · {formatBytes(item.sizeBytes)}
                  </span>
                </div>
                {/* biome-ignore lint/a11y/useMediaCaption: user's own dictation audio */}
                <audio controls src={item.playbackUrl} className="w-full" />
                <div className="flex items-center gap-1">
                  <a
                    href={item.playbackUrl}
                    download={item.fileName}
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-foreground no-underline hover:bg-accent"
                  >
                    <Download className="h-3 w-3" />
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => void archive.removeArchive(item.id)}
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" onClick={() => void archive.clearArchives()}>
            Clear all recordings
          </Button>
        </>
      )}
    </div>
  );
}

export function SuitePanels({
  open,
  onOpenChange,
  archive,
  archiveEnabled,
  onArchiveEnabledChange,
}: {
  open: PanelId;
  onOpenChange: (panel: PanelId) => void;
  archive: ArchiveView;
  archiveEnabled: boolean;
  onArchiveEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <aside className="flex w-full flex-col gap-3">
      <nav className="flex flex-wrap gap-1">
        {PANELS.map((panel) => (
          <button
            key={panel.id}
            type="button"
            onClick={() => onOpenChange(panel.id)}
            className={cn(
              "rounded border px-2.5 py-1 text-xs font-medium transition-colors",
              panel.id === open
                ? "border-corti-lime bg-corti-lime/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {panel.label}
          </button>
        ))}
      </nav>

      <div className="rounded-md border border-border bg-card p-3">
        {open === "commands" && <CommandManager />}
        {open === "replacements" && <ReplacementsPanel />}
        {open === "terms" && <TermsPanel />}
        {open === "formatting" && <FormattingPanel />}
        {open === "cleanup" && <CleanupPromptLibrary />}
        {open === "device" && <DeviceButtons />}
        {open === "archive" && (
          <ArchivePanel
            archive={archive}
            enabled={archiveEnabled}
            onEnabledChange={onArchiveEnabledChange}
          />
        )}
      </div>
    </aside>
  );
}
