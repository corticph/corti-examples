/**
 * The cleanup prompt library UI: pick which prompt cleanup runs, and read, edit,
 * add, duplicate or remove the entries.
 *
 * Lives here rather than in either caller because both the on-demand-agent
 * applet's details card and the dictation suite's cleanup panel need exactly
 * this, and it reads its own stores (no props) so embedding it is a one-liner.
 */
import { Copy, Download, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAvailableLanguages, useDictationLanguage } from "../_shared/useDictationLanguage";
import { cn, downloadJson } from "../_shared/utils";
import { useCopyEditStore } from "./agent";
import {
  type CleanupPrompt,
  DEFAULT_PROMPT,
  promptOrigin,
  promptStore,
  toExport as promptsToExport,
  removeCleanupPrompt,
  resolveActivePrompt,
  saveCleanupPrompt,
  setPinnedPromptId,
  useCleanupPrompts,
  usePinnedPromptId,
} from "./prompts";

/**
 * Stands in for "the unsaved new-prompt draft" in `draftFor`, which otherwise
 * holds a real prompt id. NUL-prefixed so it can never collide with one.
 */
const NEW_DRAFT_TARGET = "\0new";

interface PromptDraft {
  title: string;
  language: string;
  prompt: string;
}

const EMPTY_DRAFT: PromptDraft = { title: "", language: "", prompt: "" };

const toDraft = (item: CleanupPrompt): PromptDraft => ({
  title: item.title,
  language: item.language,
  prompt: item.prompt,
});

const draftEquals = (a: PromptDraft, b: PromptDraft) =>
  a.title === b.title && a.language === b.language && a.prompt === b.prompt;

/**
 * Language suggestions for the prompt editor: what this cluster can dictate in,
 * union whatever the library already uses. The datalist is a suggestion and not
 * a constraint — the supported set is server-side and grows without a client
 * release, so refusing an unlisted tag would be wrong.
 */
function languageOptions(prompts: CleanupPrompt[], available: string[], current: string): string[] {
  const seen = new Set<string>();
  for (const tag of [...available, ...prompts.map((p) => p.language), current]) {
    const clean = tag?.trim();
    if (clean) {
      seen.add(clean);
    }
  }
  return [...seen].sort();
}

export function CleanupPromptLibrary() {
  const { status, error } = useCopyEditStore();
  const { language } = useDictationLanguage();
  const available = useAvailableLanguages();
  const prompts = useCleanupPrompts();
  const pinnedId = usePinnedPromptId();

  const active = resolveActivePrompt(prompts, language, pinnedId);

  /**
   * Which entry the editor below is showing. Null follows the active prompt, so
   * the panel opens on the prompt that would actually run; clicking a row in the
   * library pins the editor to that one instead.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<PromptDraft>(EMPTY_DRAFT);
  /** The entry `draft` was seeded from, to detect that the target changed. */
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<CleanupPrompt | null>(null);

  /**
   * Focused on entering create mode. Without it the only signals that the click
   * landed are a heading change and an emptied title field, both easy to miss —
   * a caret in the field you're meant to fill in is unambiguous.
   */
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (creating) {
      titleRef.current?.focus();
    }
  }, [creating]);

  const selected = creating ? null : (prompts.find((p) => p.id === selectedId) ?? active.prompt);

  // Re-seed the editor when it starts showing a different entry — including on
  // first load, when the library arrives from storage after auth resolves.
  const target = creating ? NEW_DRAFT_TARGET : (selected?.id ?? null);
  if (draftFor !== target) {
    setDraftFor(target);
    setDraft(
      creating
        ? { title: "", language, prompt: DEFAULT_PROMPT }
        : selected
          ? toDraft(selected)
          : EMPTY_DRAFT,
    );
  }

  const options = languageOptions(prompts, available, language);
  const dirty = creating || !selected || !draftEquals(draft, toDraft(selected));
  const valid = !!draft.title.trim() && !!draft.language.trim() && !!draft.prompt.trim();
  const editable = creating || !!selected;

  const save = () => {
    const id = creating ? promptStore.newId() : (selected?.id ?? promptStore.newId());
    saveCleanupPrompt({
      id,
      title: draft.title.trim(),
      language: draft.language.trim(),
      prompt: draft.prompt.trim(),
    });
    if (creating) {
      setCreating(false);
      // Stay on the entry just created. Falling back to the active prompt would
      // snap the editor to whatever the dictation language resolves to, which
      // for a prompt written for another language is never the one just saved.
      setSelectedId(id);
    }
  };

  const revert = () => {
    if (creating) {
      setCreating(false);
      return;
    }
    if (selected) {
      setDraft(toDraft(selected));
    }
  };

  const startNew = () => {
    setCreating(true);
    setSelectedId(null);
  };

  const duplicate = (item: CleanupPrompt) => {
    saveCleanupPrompt({
      id: promptStore.newId(),
      title: `${item.title} (copy)`,
      language: item.language,
      prompt: item.prompt,
    });
  };

  const confirmRemove = () => {
    if (pendingRemoval) {
      // Drop the pin with it, or cleanup would silently fall back to another
      // language's prompt while the panel still showed a pinned selection.
      if (pinnedId === pendingRemoval.id) {
        setPinnedPromptId(null);
      }
      if (selectedId === pendingRemoval.id) {
        setSelectedId(null);
      }
      removeCleanupPrompt(pendingRemoval.id);
    }
    setPendingRemoval(null);
  };

  const selectedOrigin = selected ? promptOrigin(selected) : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Say “run cleanup” or use the toolbar button to send the whole document through a Corti agent
        that fixes spelling, grammar and punctuation without rewording it. Each prompt is written
        for one dictation language.
      </p>

      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium text-muted-foreground">Agent status:</span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 font-medium",
            status === "error"
              ? "border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400"
              : "border-border text-foreground",
          )}
        >
          {status}
        </span>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Prompt in use
        </span>
        <select
          value={pinnedId ?? ""}
          onChange={(e) => setPinnedPromptId(e.target.value || null)}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-corti-lime"
        >
          <option value="">Follow dictation language ({language})</option>
          {prompts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} ({item.language})
            </option>
          ))}
        </select>
      </label>

      {active.reason === "language" && active.prompt && (
        <p className="text-xs text-muted-foreground">
          Using <span className="font-medium text-foreground">{active.prompt.title}</span> — matches
          the dictation language ({language}).
        </p>
      )}
      {active.reason === "pinned" && active.prompt && (
        <p className="text-xs text-muted-foreground">
          Pinned to <span className="font-medium text-foreground">{active.prompt.title}</span> (
          {active.prompt.language}) for every dictation language.
        </p>
      )}
      {active.reason === "fallback" && active.prompt && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          No prompt for {language} — falling back to {active.prompt.title} ({active.prompt.language}
          ), which may copy-edit into the wrong language. Add a prompt for {language}.
        </p>
      )}
      {active.reason === "empty" && (
        <p className="text-xs text-red-600 dark:text-red-400">
          The library is empty, so cleanup has nothing to run. Add a prompt.
        </p>
      )}

      {/*
        Above the editor, not below it: these switch what the editor is showing,
        and a control that changes something further up the panel reads as doing
        nothing at all.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={startNew}>
          <Plus className="h-4 w-4" /> New prompt
        </Button>
        {prompts.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadJson("corti-cleanup-prompts.json", promptsToExport(prompts))}
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        )}
      </div>

      {/*
        The editor is always open on some entry rather than hidden behind an
        "edit" button: the prompt text IS the feature here, so reading it and
        changing it shouldn't take a click.
      */}
      {editable && (
        <div
          className={cn(
            "flex flex-col gap-2 rounded-md border bg-background p-3",
            creating ? "border-corti-lime ring-1 ring-corti-lime/40" : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {creating ? "New prompt" : `Editing “${selected?.title}”`}
            </span>
            {!creating && selectedOrigin === "builtin" && (
              <span className="text-[10px] uppercase text-muted-foreground">
                built-in — saving keeps your copy
              </span>
            )}
            {!creating && selectedOrigin === "edited" && (
              <span className="text-[10px] uppercase text-muted-foreground">edited built-in</span>
            )}
          </div>

          <div className="flex gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Title
              </span>
              <input
                ref={titleRef}
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Klinisk korrekturlæsning"
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-corti-lime"
              />
            </label>
            <label className="flex w-24 shrink-0 flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Language
              </span>
              <input
                value={draft.language}
                list="cleanup-prompt-languages"
                onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))}
                placeholder="da"
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-corti-lime"
              />
              <datalist id="cleanup-prompt-languages">
                {options.map((tag) => (
                  <option key={tag} value={tag} />
                ))}
              </datalist>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              System prompt
            </span>
            <textarea
              value={draft.prompt}
              rows={12}
              onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
              className="w-full resize-y rounded-md border border-border bg-background p-2 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-corti-lime"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} disabled={!dirty || !valid}>
              {creating ? "Add prompt" : "Save prompt"}
            </Button>
            {dirty && (
              <Button size="sm" variant="ghost" onClick={revert}>
                {creating ? "Cancel" : "Discard changes"}
              </Button>
            )}
            {selectedOrigin === "edited" && !dirty && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => selected && removeCleanupPrompt(selected.id)}
              >
                Reset to built-in
              </Button>
            )}
          </div>
        </div>
      )}

      <ul className="flex max-h-64 flex-col gap-1 overflow-auto">
        {prompts.length === 0 && (
          <li className="px-1 py-2 text-sm text-muted-foreground">No prompts yet.</li>
        )}
        {prompts.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setSelectedId(item.id);
              }}
              className={cn(
                "min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-sm transition-colors",
                item.id === selected?.id
                  ? "bg-accent text-foreground ring-1 ring-inset ring-corti-lime/60"
                  : "text-foreground hover:bg-accent/50",
              )}
            >
              {item.title}
              <span className="ml-1.5 rounded border border-border px-1 text-[10px] uppercase text-muted-foreground">
                {item.language}
              </span>
              {item.id === active.prompt?.id && (
                <span className="ml-1 rounded bg-corti-lime/20 px-1 text-[10px] uppercase">
                  in use
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => duplicate(item)}
              aria-label={`Duplicate ${item.title}`}
              className="shrink-0 rounded border border-border p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Copy className="h-3 w-3" />
            </button>
            {/*
              A catalog entry has no delete: "Reset to built-in" in the editor is
              the way back, and removing the last prompt entirely would leave
              cleanup with nothing to run.
            */}
            {promptOrigin(item) !== "builtin" && (
              <button
                type="button"
                onClick={() => setPendingRemoval(item)}
                aria-label={`Remove ${item.title}`}
                className="shrink-0 rounded border border-border p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={!!pendingRemoval} onOpenChange={(open) => !open && setPendingRemoval(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingRemoval && promptOrigin(pendingRemoval) === "edited"
                ? "Reset prompt?"
                : "Remove prompt?"}
            </DialogTitle>
            <DialogDescription>
              {pendingRemoval && promptOrigin(pendingRemoval) === "edited"
                ? `This discards your edits to “${pendingRemoval.title}” and restores the built-in prompt.`
                : `This removes “${pendingRemoval?.title}” (${pendingRemoval?.language}). This can’t be undone — export first if you want a copy.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingRemoval(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemove}>
              {pendingRemoval && promptOrigin(pendingRemoval) === "edited" ? "Reset" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
