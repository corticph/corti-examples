/**
 * DictationPanel — the dictation mode editor (right column).
 *
 * Reuses the Dictation Suite's editor pattern: a contentEditable div driven
 * by EditorAdapter + useActiveControl, with undo/redo (editorHistory) and
 * per-interaction draft persistence (interactionDraft). The transcript handler
 * inserts final segments at the caret with the shared casing/spacing rules.
 *
 * Includes a "Run cleanup" button that sends the editor text to the Corti
 * copy-editor agent and replaces it with the corrected result. The cleanup
 * prompt is configured in the SpeechFlex config dialog (Cleanup tab).
 *
 * The mic control (CortiDictationComponent) is NOT here — it stays in the
 * header so it's always visible regardless of mode. This component only owns
 * the editor surface and toolbar.
 */

import type { CortiAuth } from "@corti/sdk";
import {
  Bold,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Italic,
  Loader2,
  Mic,
  Redo2,
  RotateCcw,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { dispatchCommand } from "../_shared/commandDispatch";
import type { EditorAdapter } from "../_shared/editorAdapter";
import { useActiveControl } from "../_shared/useActiveControl";
import type { CortiSdkEnvironment } from "../_shared/useCortiAccessToken";
import { cn } from "../_shared/utils";
import { buildRegistry, TEMPLATES } from "../dictation-commands/commandModel";
import { logCommand, useCommandStore } from "../dictation-commands/commandStore";
import { useEditorHistory } from "../dictation-suite/editorHistory";
import {
  clearCopyEditUndo,
  configureCopyEdit,
  revertCopyEdit,
  runCopyEdit,
  useCopyEditStore,
} from "../on-demand-agent/agent";
import {
  resolveSelectedPrompt,
  setPromptIdentity,
  useCleanupPrompts,
  useSelectedPromptId,
} from "../on-demand-agent/prompts";
import { useInteractionDraft } from "./interactionDraft";
import { Badge, Card, Eyebrow } from "./kit";

const CLEANUP_STATUS_LABEL: Record<string, string> = {
  preparing: "Preparing agent…",
  running: "Cleaning up…",
};

function formatSavedAt(savedAt: number | null): string {
  if (!savedAt) {
    return "Not saved yet";
  }
  return `Draft saved ${new Date(savedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

const iconButtonClasses =
  "inline-flex h-7 w-7 items-center justify-center rounded-[5px] border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40";
const textButtonClasses =
  "inline-flex h-7 items-center gap-1.5 rounded-[5px] border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50";

export interface DictationPanelRef {
  editorEl: HTMLElement | null;
  adapter: ReturnType<typeof useActiveControl>["adapter"];
}

export function DictationPanel({
  interactionId,
  clientId,
  tenant,
  language,
  transcriptHandlerRef,
  commandHandlerRef,
  onTextChange,
  authConfig,
  sdkEnvironment,
}: {
  interactionId: string | null;
  clientId: string;
  tenant: string;
  language: string;
  transcriptHandlerRef: React.MutableRefObject<((e: CustomEvent) => void) | null>;
  commandHandlerRef: React.MutableRefObject<((e: CustomEvent) => void) | null>;
  onTextChange?: (text: string) => void;
  authConfig: CortiAuth.AuthTokenDerivable;
  sdkEnvironment: CortiSdkEnvironment;
}) {
  const editorColumnRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const { adapter } = useActiveControl(editorColumnRef);
  const adapterRef = useRef<EditorAdapter | null>(null);
  adapterRef.current = adapter;

  const { savedAt, clear: clearDraft } = useInteractionDraft(
    editorRef,
    clientId,
    tenant,
    interactionId,
  );

  const {
    canUndo,
    canRedo,
    undo,
    redo,
    checkpoint,
    rebase: rebaseHistory,
  } = useEditorHistory(editorRef);

  const cleanup = useCopyEditStore();
  const cleanupPrompts = useCleanupPrompts();
  const selectedPromptId = useSelectedPromptId();

  // Rebase history when the interaction changes — the restored draft belongs
  // to a different visit, so the old undo stack no longer describes the editor.
  // (Text sync to the parent happens via the MutationObserver below, which also
  // covers the draft restore's DOM mutations on visit switches.)
  useEffect(() => {
    rebaseHistory();
  }, [interactionId, rebaseHistory]);

  // Wire agent identity and config.
  useEffect(() => {
    setPromptIdentity(clientId, tenant, "speech-flex");
  }, [clientId, tenant]);

  useEffect(() => {
    configureCopyEdit(authConfig, sdkEnvironment, clientId, tenant);
  }, [authConfig, sdkEnvironment, clientId, tenant]);

  const activePrompt = resolveSelectedPrompt(cleanupPrompts, selectedPromptId);

  // Install the active prompt on the agent whenever it changes.
  useEffect(() => {
    if (activePrompt) {
      import("../on-demand-agent/agent").then(({ setActivePrompt }) => {
        setActivePrompt(activePrompt.prompt);
      });
    }
  }, [activePrompt]);

  const [interim, setInterim] = useState("");
  const [copied, setCopied] = useState(false);

  // Command handler — built here because we have the editor adapter.
  const { commands } = useCommandStore();
  const registry = useMemo(() => buildRegistry(commands), [commands]);
  const registryRef = useRef(registry);
  registryRef.current = registry;

  const handleCommand = useCallback(
    (e: CustomEvent) => {
      const data = e.detail?.data;
      const a = adapterRef.current;
      if (!data || !a) {
        return;
      }
      const outcome = dispatchCommand(a, data, registryRef.current, {
        history: [],
        templates: TEMPLATES,
        primaryLanguage: language,
      });
      logCommand({
        id: data.id,
        variables: data.variables,
        description: outcome.description,
      });
    },
    [language],
  );

  useEffect(() => {
    commandHandlerRef.current = handleCommand;
    return () => {
      commandHandlerRef.current = null;
    };
  }, [handleCommand, commandHandlerRef]);

  const handleTranscript = useCallback(
    (e: CustomEvent) => {
      const data = e.detail?.data;
      if (!data || Array.isArray(data)) {
        return;
      }
      if (!data.isFinal) {
        setInterim(data.text);
        return;
      }
      setInterim("");
      adapterRef.current?.insert(data.text, { primaryLanguage: language });
    },
    [language],
  );

  useEffect(() => {
    transcriptHandlerRef.current = handleTranscript;
    return () => {
      transcriptHandlerRef.current = null;
    };
  }, [handleTranscript, transcriptHandlerRef]);

  const format = (style: "bold" | "italic") => {
    adapterRef.current?.applyFormat?.(style);
  };

  const clear = () => {
    clearDraft();
    clearCopyEditUndo();
  };

  const copyDraft = async () => {
    const text = editorRef.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Draft copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  const runCleanup = () => {
    const target = adapterRef.current;
    if (!target) {
      return;
    }
    checkpoint();
    void runCopyEdit(target);
  };

  const revertCleanup = () => {
    const target = adapterRef.current;
    if (!target) {
      return;
    }
    revertCopyEdit(target);
  };

  const cleanupBusy = cleanup.status === "running" || cleanup.status === "preparing";

  const [editorOpen, setEditorOpen] = useState(true);

  // Presence badge in the header (a literal "1" when the editor has any
  // text, nothing when empty), mirroring the transcript panel's count
  // badge — plus the text sync to the parent: `onTextChange` feeds note
  // generation's dictation source, and dictated inserts (via the adapter),
  // typing, draft restores on visit switch, and copy-edit rewrites never
  // fire `input` events, so only a MutationObserver sees them. Without
  // this, dictated text would stay in the editor but never reach note
  // generation. The editor stays mounted across collapse (hidden, not
  // unmounted) so a single observer covers the panel's lifetime; the
  // parent sync is debounced so a burst of mutations reads innerText once.
  const [hasText, setHasText] = useState(false);
  const textChangeRef = useRef(onTextChange);
  textChangeRef.current = onTextChange;
  useEffect(() => {
    const el = editorRef.current;
    if (!el) {
      return;
    }
    const readText = () => el.innerText ?? "";
    let timer: number | undefined;
    const update = () => setHasText(readText().trim().length > 0);
    const sync = () => {
      textChangeRef.current?.(readText());
    };
    const scheduleSync = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(sync, 150);
    };
    // Initial sync — covers the draft already restored at mount time.
    update();
    sync();
    const observer = new MutationObserver(() => {
      update();
      scheduleSync();
    });
    observer.observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <Card className="flex min-w-0 flex-col">
      <button
        type="button"
        onClick={() => setEditorOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          {editorOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <Mic className="h-[13px] w-[13px] shrink-0 text-muted-foreground" />
          <Eyebrow>Dictation</Eyebrow>
          {hasText && <Badge tone="neutral">1</Badge>}
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">
          {formatSavedAt(savedAt)}
        </span>
      </button>
      {/* The editor body is kept mounted and hidden with CSS (not unmounted)
          on collapse. Unmounting it would null `editorRef`/`editorColumnRef`,
          but the MutationObserver (useInteractionDraft) and the focusin
          listener (useActiveControl) are attached once on mount and don't
          re-bind to a remounted node — so a collapse/expand cycle would
          silently drop the dictated text and stop persisting new edits.
          Hiding keeps the live nodes, the observer, and the adapter valid. */}
      <div
        ref={editorColumnRef}
        className={cn("flex min-w-0 flex-col gap-2.5 p-3.5", !editorOpen && "hidden")}
      >
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => format("bold")}
            className={iconButtonClasses}
            aria-label="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => format("italic")}
            className={iconButtonClasses}
            aria-label="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>

          <span className="mx-1 h-5 w-px bg-border" />

          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (⌘Z)"
            aria-label="Undo"
            className={iconButtonClasses}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (⇧⌘Z)"
            aria-label="Redo"
            className={iconButtonClasses}
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>

          <span className="mx-1 h-5 w-px bg-border" />

          <button
            type="button"
            onClick={runCleanup}
            disabled={cleanupBusy}
            className={cn(textButtonClasses, "text-foreground")}
          >
            {cleanupBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {CLEANUP_STATUS_LABEL[cleanup.status] ?? "Run cleanup"}
          </button>

          {cleanup.undo && (
            <button
              type="button"
              onClick={revertCleanup}
              disabled={cleanupBusy}
              title="Restore the text as it was before the last cleanup"
              className={cn(textButtonClasses, "text-foreground")}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Revert
            </button>
          )}

          <button
            type="button"
            onClick={copyDraft}
            className={cn(textButtonClasses, "text-muted-foreground hover:text-foreground")}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>

          <button
            type="button"
            onClick={clear}
            className={cn(textButtonClasses, "text-muted-foreground hover:text-foreground")}
            aria-label="Clear text"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {cleanup.error && <p className="text-[13px] text-variant-error-text">{cleanup.error}</p>}
        {cleanup.noChange && (
          <p className="text-xs text-muted-foreground">Cleanup found nothing to change.</p>
        )}

        {/* Editor */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          data-testid="speech-flex-editor"
          onInput={() => onTextChange?.(editorRef.current?.innerText ?? "")}
          className={cn(
            "min-h-[280px] flex-1 rounded-[5px] border border-border bg-background p-3.5 text-[13px] leading-relaxed text-foreground outline-none focus:border-lime-600 dark:focus:border-corti-lime",
            "[&:empty]:before:text-muted-foreground [&:empty]:before:content-['Place_your_caret_and_start_dictating…']",
          )}
        />
        {interim && <p className="text-[13px] italic text-muted-foreground">{interim}</p>}
      </div>
    </Card>
  );
}
