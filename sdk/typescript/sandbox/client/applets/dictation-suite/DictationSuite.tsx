/**
 * Applet — CONCEPT: composing every dictation feature into one screen.
 *
 * One editor, one microphone, every feature live at once.
 *
 * The other dictation applets each demonstrate ONE concept in isolation, and
 * each builds its own dictation config, so they can't run together: you can have
 * replacements OR voice commands OR the cleanup agent, never all three. Each
 * also keeps its text in component-local state that navigating away throws
 * away. This applet is what it looks like when they're combined:
 *
 *   - one merged config (see suiteConfig.ts) carries replacements, dictionary
 *     terms and the full command set on a single socket
 *   - the editor's content is persisted (see draftStore.ts), so text survives
 *     navigation, reload and closing the tab
 *   - commands dispatch through EditorAdapter for text actions and through the
 *     suite's own handlers for app actions (see suiteControls.ts)
 *   - handheld microphone buttons drive recording via the web component's HID
 *     control, and command-mapped buttons run through the same command path as
 *     speech (see useHidCommandHandler below)
 *   - audio is archived by a parallel recorder (see useParallelArchive.ts)
 */
import type { CortiDictation } from "@corti/dictation-web";
import type { Corti } from "@corti/sdk";
import {
  Bold,
  Check,
  Copy,
  Italic,
  Loader2,
  Redo2,
  RotateCcw,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { dispatchCommand } from "../_shared/commandDispatch";
import { identityNamespace } from "../_shared/configStore";
import { CortiDictationComponent } from "../_shared/cortiDictationReact";
import type { EditorAdapter } from "../_shared/editorAdapter";
import type { Range } from "../_shared/offsetMap";
import { useActiveControl } from "../_shared/useActiveControl";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useHidCommandCatalog, useHidCommandHandler } from "../_shared/useDictationDevice";
import { useDictationLanguage } from "../_shared/useDictationLanguage";
import { cn } from "../_shared/utils";
import { buildRegistry, TEMPLATES, toTranscribeCommands } from "../dictation-commands/commandModel";
import {
  logCommand,
  setIdentity as setCommandIdentity,
  useCommandStore,
} from "../dictation-commands/commandStore";
import { termStore } from "../dictionary-terms/terms";
import { useFormattingConfig } from "../formatting/formattingStore";
import {
  clearCopyEditUndo,
  configureCopyEdit,
  revertCopyEdit,
  runCopyEdit,
  setActivePrompt,
  useCopyEditStore,
} from "../on-demand-agent/agent";
import {
  resolveActivePrompt,
  setPromptIdentity,
  useCleanupPrompts,
  usePinnedPromptId,
} from "../on-demand-agent/prompts";
import { replacementStore } from "../text-replacements/replacements";
import { useDraftPersistence } from "./draftStore";
import { useEditorHistory } from "./editorHistory";
import { SuitePanels } from "./SuitePanels";
import { buildSuiteConfig } from "./suiteConfig";
import {
  type PanelId,
  resolvePanel,
  SUITE_COMMANDS,
  SUITE_FOCUS_EDITOR_COMMAND_ID,
  SUITE_SHOW_PANEL_COMMAND_ID,
} from "./suiteControls";
import { useCaretOverlay } from "./useCaretOverlay";
import { useParallelArchive } from "./useParallelArchive";

const CLEANUP_STATUS_LABEL: Record<string, string> = {
  preparing: "Preparing agent…",
  running: "Cleaning up…",
};

function formatSavedAt(savedAt: number | null): string {
  if (!savedAt) {
    return "Not saved yet";
  }
  return `Draft saved ${new Date(savedAt).toLocaleTimeString()}`;
}

export function DictationSuite() {
  const { authConfig, clientId, tenantName, sdkEnvironment, isReady } = useCortiAccessToken();
  const { language, onLanguagesChanged } = useDictationLanguage();
  const namespace = identityNamespace(clientId, tenantName);

  // The active-control container wraps ONLY the editor column. Panels contain
  // their own inputs (rule editors), and focusing one of those must never make
  // it the dictation target.
  const editorColumnRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  // State, not a ref: the dictation element only mounts once auth resolves, and
  // the archive hook has to re-subscribe when it appears.
  const [dictationEl, setDictationEl] = useState<InstanceType<typeof CortiDictation> | null>(null);
  const { adapter } = useActiveControl(editorColumnRef);
  const adapterRef = useRef<EditorAdapter | null>(null);
  adapterRef.current = adapter;

  const { savedAt, clear: clearDraft } = useDraftPersistence(editorRef, clientId, tenantName);
  // Declared after useDraftPersistence on purpose: effect order is declaration
  // order, so the stored draft is restored before the history observer attaches
  // and the restore isn't recorded as an undoable edit.
  const {
    canUndo,
    canRedo,
    undo,
    redo,
    checkpoint,
    rebase: rebaseHistory,
  } = useEditorHistory(editorRef);

  const replacements = replacementStore.useItems();
  const terms = termStore.useItems();
  const { config: formattingConfig } = useFormattingConfig();
  const { commands } = useCommandStore();
  const cleanup = useCopyEditStore();
  const cleanupPrompts = useCleanupPrompts();
  const pinnedPromptId = usePinnedPromptId();

  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Tracks the time span of the most recently detected command so a late
  // interim transcript for the same span (the command phrase) can't
  // re-populate the interim preview after the command handler cleared it.
  const lastCommandSpanRef = useRef<{ start: number; end: number } | null>(null);

  // Tracks the end time of the most recently committed final transcript so a
  // late interim whose span predates it can't re-populate the preview after
  // the final already cleared it (stop/flush out-of-order race). Cleared when
  // a new recording session starts so finals from a prior session don't
  // suppress legitimate interims.
  const lastFinalEndRef = useRef<number | null>(null);
  const [openPanel, setOpenPanel] = useState<PanelId>("commands");
  const [archiveEnabled, setArchiveEnabled] = useState(false);
  const [copied, setCopied] = useState(false);

  const archive = useParallelArchive(dictationEl, namespace, archiveEnabled);

  /**
   * Pixel coordinates for the inline interim-preview overlay. The interim
   * text is rendered as a sibling overlay at the caret, not below the editor,
   * so the user's eyes stay where the dictated text will land. See
   * useCaretOverlay for why this is an overlay and not DOM injection.
   */
  const { pos: caretPos, remeasure: remeasureCaret } = useCaretOverlay(editorRef, adapter, interim);

  /**
   * A latch, deliberately not `isReady` itself: `useCortiAuth.getStreamToken`
   * sets `authStatus.step = "authenticating"` on EVERY mint, refreshes
   * included, so `isReady` drops to false periodically for the life of the
   * session. Rendering the element on `isReady` would therefore unmount it
   * mid-dictation on each refresh, tearing down the socket and discarding
   * queued audio. Only the first token gates the mount; after that the
   * component keeps itself supplied through `refreshAccessToken`, and
   * `authConfig.authToken` holds its previous value throughout a refresh, so
   * the token prop never goes empty again.
   */
  const [tokenSeen, setTokenSeen] = useState(false);
  useEffect(() => {
    if (isReady) {
      setTokenSeen(true);
    }
  }, [isReady]);

  /** Committed dictation ranges, for "delete that" / "capitalize that". */
  const historyRef = useRef<Range[]>([]);

  // Point every per-API-client store at this tenant/client once auth resolves.
  useEffect(() => {
    setCommandIdentity(clientId, tenantName);
    replacementStore.setIdentity(clientId, tenantName);
    termStore.setIdentity(clientId, tenantName);
    setPromptIdentity(clientId, tenantName);
    // The draft re-seeds from the new namespace's storage (see draftStore), so
    // the old document's history no longer describes what's in the editor.
    rebaseHistory();
  }, [clientId, tenantName, rebaseHistory]);

  useEffect(() => {
    configureCopyEdit(authConfig, sdkEnvironment, clientId, tenantName);
  }, [authConfig, sdkEnvironment, clientId, tenantName]);

  /**
   * Which library prompt cleanup should run: the one written for the language
   * being dictated, unless the user pinned one.
   */
  const activePrompt = useMemo(
    () => resolveActivePrompt(cleanupPrompts, language, pinnedPromptId),
    [cleanupPrompts, language, pinnedPromptId],
  );

  // Install it on the agent as soon as the selection changes, so switching
  // language mid-session doesn't leave the previous language's prompt live —
  // and so the round-trip is paid here rather than inside a cleanup run.
  useEffect(() => {
    if (activePrompt.prompt) {
      setActivePrompt(activePrompt.prompt.prompt);
    }
  }, [activePrompt]);

  // One config for everything: user commands + the suite's own, plus the
  // server-side replacement and vocabulary sets.
  const dictationConfig = useMemo(
    () =>
      buildSuiteConfig(language, {
        replacements,
        terms,
        commands: [...toTranscribeCommands(commands), ...SUITE_COMMANDS],
        formatting: formattingConfig,
      }),
    [language, replacements, terms, commands, formattingConfig],
  );

  const handleTranscript = useCallback(
    (e: CustomEvent) => {
      setError(null);
      const data = e.detail?.data;
      if (!data || Array.isArray(data)) {
        return;
      }
      if (!data.isFinal) {
        // A late interim whose time span overlaps the most recent command
        // is the command phrase itself arriving as transcript — the command
        // handler already cleared the interim. Don't let it reappear.
        const cmdSpan = lastCommandSpanRef.current;
        if (cmdSpan && data.start <= cmdSpan.end && data.end >= cmdSpan.start) {
          return;
        }
        // A late interim that predates the most recent final transcript is
        // an out-of-order message from a stop/flush race — the final already
        // cleared the interim. Don't let it reappear.
        const finalEnd = lastFinalEndRef.current;
        if (finalEnd !== null && data.end <= finalEnd) {
          return;
        }
        setInterim(data.text);
        return;
      }
      lastCommandSpanRef.current = null;
      lastFinalEndRef.current = data.end;
      setInterim("");
      const inserted = adapterRef.current?.insert(data.text, {
        primaryLanguage: language,
      });
      if (inserted) {
        historyRef.current = [...historyRef.current, inserted].slice(-50);
      }
    },
    [language],
  );

  const runCleanup = useCallback(() => {
    const target = adapterRef.current;
    if (!target) {
      return;
    }
    // Close the current undo step so the rewrite is undoable on its own rather
    // than merged with whatever was typed in the last half second.
    checkpoint();
    void runCopyEdit(target);
  }, [checkpoint]);

  const revertCleanup = useCallback(() => {
    const target = adapterRef.current;
    if (!target) {
      return;
    }
    revertCopyEdit(target);
  }, []);

  /**
   * Clearing the draft drops the cleanup snapshot too — otherwise "Revert
   * cleanup" would still be offered on an emptied editor and would resurrect
   * the text the user just discarded.
   */
  const clear = useCallback(() => {
    clearDraft();
    clearCopyEditUndo();
  }, [clearDraft]);

  const copyDraft = useCallback(async () => {
    const text = editorRef.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Draft copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  }, []);

  /**
   * The one command path for the suite, shared by speech and by handheld-mic
   * buttons. Both arrive as the same `TranscribeCommandData` shape — a button
   * press simply carries no variables — so neither route can drift away from
   * the other's undo behaviour, app-level commands or debugger logging.
   */
  const runCommandData = useCallback(
    (data: Corti.TranscribeCommandData) => {
      // Clear the interim preview before any dispatch — the command phrase
      // was visible as interim text, and it should vanish the instant the
      // command is recognized, not after the command finishes executing.
      // Also record the command's time span so a late interim transcript
      // for the same span (the command phrase arriving as transcript) can't
      // re-populate the preview.
      setInterim("");
      if (data.start !== undefined && data.end !== undefined) {
        lastCommandSpanRef.current = { start: data.start, end: data.end };
      }

      // App-level commands first — they don't need an editor adapter.
      if (data.id === SUITE_SHOW_PANEL_COMMAND_ID) {
        const spoken = data.variables?.panel ?? "";
        const panel = resolvePanel(spoken);
        if (panel) {
          setOpenPanel(panel);
        }
        logCommand({
          id: data.id,
          variables: data.variables,
          description: panel ? `Opened ${panel} panel` : `Unknown panel: ${spoken}`,
        });
        return;
      }
      if (data.id === SUITE_FOCUS_EDITOR_COMMAND_ID) {
        editorRef.current?.focus();
        logCommand({
          id: data.id,
          variables: data.variables,
          description: "Focused the editor",
        });
        return;
      }

      const target = adapterRef.current;
      if (!target) {
        return;
      }

      // The cleanup agent rewrites the whole document, so it isn't an
      // EditorAdapter action in the dispatch registry — run it directly.
      if (data.id === "copy_edit") {
        runCleanup();
        logCommand({
          id: data.id,
          variables: data.variables,
          description: "Ran the cleanup agent",
        });
        return;
      }

      // A command action is a discrete edit — often a destructive one (delete
      // that, backspace) — so it gets its own undo step.
      checkpoint();
      const outcome = dispatchCommand(target, data, buildRegistry(commands), {
        history: historyRef.current,
        templates: TEMPLATES,
        primaryLanguage: language,
      });
      if (outcome.history) {
        historyRef.current = outcome.history;
      }
      // A command that edits the editor moves where the next dictated text
      // will land (e.g. "new paragraph" inserts a <br>). The DOM selection
      // doesn't follow when focus is on the mic button, so re-measure so
      // the next interim renders at the new caret from the start.
      remeasureCaret();
      logCommand({
        id: data.id,
        variables: data.variables,
        description: outcome.description,
      });
    },
    [commands, language, runCleanup, checkpoint, remeasureCaret],
  );

  const handleCommand = useCallback(
    (e: CustomEvent) => {
      const data = e.detail?.data;
      if (data) {
        runCommandData(data);
      }
    },
    [runCommandData],
  );

  /**
   * A command-mapped handheld button runs the command locally, exactly as if it
   * had been spoken — the API doesn't execute button-triggered commands, and
   * the shared device store drops the press entirely unless a consumer is
   * registered here.
   */
  const handleHidCommand = useCallback(
    (commandId: string) =>
      runCommandData({
        id: commandId,
        variables: {},
      } as Corti.TranscribeCommandData),
    [runCommandData],
  );
  useHidCommandHandler(handleHidCommand);
  useHidCommandCatalog(
    "dictation-suite",
    useMemo(
      () => [
        ...commands.map((c) => ({ id: c.id, label: c.id })),
        { id: "copy_edit", label: "copy_edit" },
        { id: SUITE_SHOW_PANEL_COMMAND_ID, label: SUITE_SHOW_PANEL_COMMAND_ID },
        {
          id: SUITE_FOCUS_EDITOR_COMMAND_ID,
          label: SUITE_FOCUS_EDITOR_COMMAND_ID,
        },
      ],
      [commands],
    ),
  );

  const format = (style: "bold" | "italic") => {
    adapterRef.current?.applyFormat?.(style);
  };

  const cleanupBusy = cleanup.status === "running" || cleanup.status === "preparing";

  return (
    <div className="flex flex-col gap-4">
      {/* No title here — the applet page renders it above this component. */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {replacements.length} replacements · {terms.length} terms · {commands.length} commands
        </p>
        {/*
          Mounted only once a token exists: <corti-dictation> validates
          `authConfig.accessToken` on every property update and logs "Access
          token is required and must be a string" for each render it sees an
          empty one. Auth resolves asynchronously (GET /api/config → mint a
          stream token), and this is the app's landing screen, so without the
          gate the component always mounts before the token arrives.
        */}
        {tokenSeen ? (
          <CortiDictationComponent
            ref={setDictationEl}
            authConfig={authConfig}
            dictationConfig={dictationConfig}
            settingsEnabled={["device", "language", "keybinding"]}
            onTranscript={handleTranscript}
            onCommand={handleCommand}
            onRecordingStateChanged={(e: CustomEvent) => {
              if (e.detail?.state === "recording") {
                lastCommandSpanRef.current = null;
                lastFinalEndRef.current = null;
              } else if (e.detail?.state === "stopped") {
                lastCommandSpanRef.current = null;
              }
            }}
            onLanguagesChanged={onLanguagesChanged}
            onError={(e: CustomEvent) => setError(e.detail?.message ?? "Unknown error")}
          />
        ) : (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for authentication…
          </span>
        )}
      </header>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <span>
            <span className="font-semibold">Recording error: </span>
            {error}
          </span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 text-xs hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
      {cleanup.error && (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <span className="font-semibold">Cleanup: </span>
          {cleanup.error}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* Editor column — the only dictation target. */}
        <div ref={editorColumnRef} className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => format("bold")}
              className="rounded border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Bold"
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => format("italic")}
              className="rounded border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Italic"
            >
              <Italic className="h-4 w-4" />
            </button>

            <span className="mx-1 h-5 w-px bg-border" />

            {/*
              Undo/redo as buttons as well as keys: the keybinding only fires
              while the caret is in the editor, and after clicking a toolbar
              control or a side panel it isn't.
            */}
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (⌘Z)"
              aria-label="Undo"
              className="rounded border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (⇧⌘Z)"
              aria-label="Redo"
              className="rounded border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <Redo2 className="h-4 w-4" />
            </button>

            <span className="mx-1 h-5 w-px bg-border" />

            <button
              type="button"
              onClick={runCleanup}
              disabled={cleanupBusy}
              className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {cleanupBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {CLEANUP_STATUS_LABEL[cleanup.status] ?? "Run cleanup"}
            </button>

            {/*
              Only while a rewrite is actually revertible — the snapshot is
              consumed on use, so this comes and goes with it rather than
              sitting there disabled.
            */}
            {cleanup.undo && (
              <button
                type="button"
                onClick={revertCleanup}
                disabled={cleanupBusy}
                title="Restore the text as it was before the last cleanup"
                className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Revert cleanup
              </button>
            )}

            <button
              type="button"
              onClick={copyDraft}
              className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy text"}
            </button>

            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear text
            </button>

            <span className="ml-auto text-xs text-muted-foreground">{formatSavedAt(savedAt)}</span>
          </div>

          {/*
            The interim preview is an overlay sibling at the caret, not a child
            of the contenteditable — injecting it would corrupt the adapter's
            offset model. The wrapper scopes the absolute positioning to the
            editor only (not the toolbar above), and pointer-events-none keeps
            clicks reaching the editor at exactly the caret position.
          */}
          <div className="relative">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              data-testid="suite-editor"
              className={cn(
                "min-h-[420px] w-full rounded-md border border-border bg-background p-3 text-sm leading-relaxed text-foreground outline-none focus:border-corti-lime",
                "[&:empty]:before:text-muted-foreground [&:empty]:before:content-['Place_your_caret_and_start_dictating…']",
              )}
            />
            {interim && caretPos && (
              <span
                className="absolute whitespace-pre-wrap rounded-sm bg-background text-sm italic leading-relaxed text-muted-foreground pointer-events-none"
                style={{
                  top: `${caretPos.top}px`,
                  left: `${caretPos.left}px`,
                  maxWidth: `${caretPos.maxWidth}px`,
                }}
              >
                {/* A single space separates the preview from the text that
                 precedes it on the same line — `whitespace-pre-wrap` keeps it
                 from collapsing. Skip it at a line start (caret at the content
                 origin, e.g. after a newline or in an empty editor) where there
                 is no preceding text to separate from, and when the interim
                 already leads with whitespace so a streamed space isn't
                 doubled. */}
                {caretPos.atLineStart || /^\s/.test(interim) ? interim : ` ${interim}`}
              </span>
            )}
          </div>
          {cleanup.noChange && (
            <p className="text-xs text-muted-foreground">Cleanup found nothing to change.</p>
          )}
        </div>

        <h3 className="text-sm font-semibold text-foreground">Configuration</h3>

        <SuitePanels
          open={openPanel}
          onOpenChange={setOpenPanel}
          archive={archive}
          archiveEnabled={archiveEnabled}
          onArchiveEnabledChange={setArchiveEnabled}
        />
      </div>
    </div>
  );
}
