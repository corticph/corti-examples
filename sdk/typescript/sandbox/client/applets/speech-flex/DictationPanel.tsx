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
  resolveActivePrompt,
  setPromptIdentity,
  useCleanupPrompts,
  usePinnedPromptId,
} from "../on-demand-agent/prompts";
import { useInteractionDraft } from "./interactionDraft";

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
  const pinnedPromptId = usePinnedPromptId();

  // Rebase history when the interaction changes — the restored draft belongs
  // to a different visit, so the old undo stack no longer describes the editor.
  useEffect(() => {
    rebaseHistory();
    onTextChange?.(editorRef.current?.innerText ?? "");
  }, [interactionId, rebaseHistory, onTextChange]);

  // Wire agent identity and config.
  useEffect(() => {
    setPromptIdentity(clientId, tenant);
  }, [clientId, tenant]);

  useEffect(() => {
    configureCopyEdit(authConfig, sdkEnvironment, clientId, tenant);
  }, [authConfig, sdkEnvironment, clientId, tenant]);

  const activePrompt = resolveActivePrompt(cleanupPrompts, language, pinnedPromptId);

  // Install the active prompt on the agent whenever it changes.
  useEffect(() => {
    if (activePrompt.prompt) {
      import("../on-demand-agent/agent").then(({ setActivePrompt }) => {
        setActivePrompt(activePrompt.prompt.prompt);
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

  return (
    <div ref={editorColumnRef} className="flex min-w-0 flex-col gap-2">
      {/* Toolbar */}
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

        {cleanup.undo && (
          <button
            type="button"
            onClick={revertCleanup}
            disabled={cleanupBusy}
            title="Restore the text as it was before the last cleanup"
            className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Revert
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

      {cleanup.error && <p className="text-sm text-red-600 dark:text-red-400">{cleanup.error}</p>}
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
          "min-h-[420px] w-full rounded-md border border-border bg-background p-3 text-sm leading-relaxed text-foreground outline-none focus:border-lime-600 dark:focus:border-corti-lime",
          "[&:empty]:before:text-muted-foreground [&:empty]:before:content-['Place_your_caret_and_start_dictating…']",
        )}
      />
      {interim && <p className="text-sm italic text-muted-foreground">{interim}</p>}
    </div>
  );
}
