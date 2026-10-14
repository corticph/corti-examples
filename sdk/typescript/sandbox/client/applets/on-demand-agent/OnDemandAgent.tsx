/**
 * Applet — CONCEPT: on-demand agent (agentic copy-edit).
 *
 * Dictate into the editor, then say "copy edit" (or click Run copy-edit) to send
 * the text through a Corti Agentic Framework agent that applies a minimal
 * spelling/grammar/punctuation copy-edit and replaces the text. Wording and
 * content are preserved; the prompt comes from the language-tagged library in
 * the details card, and the rewrite can be reverted.
 */

import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CortiDictationComponent } from "../_shared/cortiDictationReact";
import type { EditorAdapter } from "../_shared/editorAdapter";
import { useActiveControl } from "../_shared/useActiveControl";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useHidCommandCatalog, useHidCommandHandler } from "../_shared/useDictationDevice";
import { useDictationLanguage } from "../_shared/useDictationLanguage";
import {
  COPY_EDIT_COMMAND_ID,
  configureCopyEdit,
  revertCopyEdit,
  runCopyEdit,
  setActivePrompt,
  useCopyEditStore,
} from "./agent";
import { buildCopyEditConfig } from "./config";
import {
  resolveActivePrompt,
  setPromptIdentity,
  useCleanupPrompts,
  usePinnedPromptId,
} from "./prompts";

const STATUS_LABEL: Record<string, string> = {
  preparing: "Preparing agent…",
  running: "Copy-editing…",
  ready: "Agent ready",
};

export function OnDemandAgent() {
  const { authConfig, clientId, tenantName, sdkEnvironment } = useCortiAccessToken();
  const { language, onLanguagesChanged } = useDictationLanguage();
  const { status, error, noChange, undo } = useCopyEditStore();
  const prompts = useCleanupPrompts();
  const pinnedPromptId = usePinnedPromptId();
  const containerRef = useRef<HTMLDivElement>(null);
  const { adapter } = useActiveControl(containerRef);
  const adapterRef = useRef<EditorAdapter | null>(null);
  adapterRef.current = adapter;
  const [interim, setInterim] = useState("");

  const config = useMemo(() => buildCopyEditConfig(language), [language]);

  useEffect(() => {
    configureCopyEdit(authConfig, sdkEnvironment, clientId, tenantName);
  }, [authConfig, sdkEnvironment, clientId, tenantName]);

  useEffect(() => {
    setPromptIdentity(clientId, tenantName);
  }, [clientId, tenantName]);

  /**
   * Which library prompt to run: the one written for the language being
   * dictated, unless the user pinned one. Installed as soon as the selection
   * changes so switching language mid-session doesn't leave the previous
   * language's prompt live, and so the round-trip is paid here rather than
   * inside a copy-edit run.
   */
  const activePrompt = useMemo(
    () => resolveActivePrompt(prompts, language, pinnedPromptId),
    [prompts, language, pinnedPromptId],
  );

  useEffect(() => {
    if (activePrompt.prompt) {
      setActivePrompt(activePrompt.prompt.prompt);
    }
  }, [activePrompt]);

  const handleTranscript = useCallback((e: CustomEvent) => {
    const data = e.detail?.data;
    if (!data || Array.isArray(data)) {
      return;
    }
    if (data.isFinal) {
      setInterim("");
      adapterRef.current?.insert(data.text, { primaryLanguage: language });
    } else {
      setInterim(data.text);
    }
  }, []);

  const handleCommand = useCallback((e: CustomEvent) => {
    if (e.detail?.data?.id === COPY_EDIT_COMMAND_ID && adapterRef.current) {
      runCopyEdit(adapterRef.current);
    }
  }, []);

  // A command-mapped handheld button triggers copy-edit the same way.
  const handleHidCommand = useCallback((commandId: string) => {
    if (commandId === COPY_EDIT_COMMAND_ID && adapterRef.current) {
      runCopyEdit(adapterRef.current);
    }
  }, []);
  useHidCommandHandler(handleHidCommand);
  useHidCommandCatalog(
    "on-demand-agent",
    useMemo(() => [{ id: COPY_EDIT_COMMAND_ID, label: COPY_EDIT_COMMAND_ID }], []),
  );

  useEffect(() => {
    adapterRef.current?.focus();
  }, []);

  const busy = status === "running";

  return (
    <div className="flex flex-col gap-4" ref={containerRef}>
      <div>
        <h2 className="text-lg font-semibold text-foreground">On-demand agent (copy-edit)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Link the “copy edit” speech-to-text command to an on-demand Corti agent, or click Run
          copy-edit, to correct typed or dictated text for spelling, grammar, and punctuation.
          Wording and clinical content are preserved — the prompt is picked to match the dictation
          language from the library in the agent card below.
        </p>
      </div>

      <div className="relative">
        <textarea
          rows={12}
          readOnly={busy}
          placeholder="Dictate freely (errors and all), then copy-edit to clean it up…"
          className="w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground outline-none focus:border-corti-lime"
        />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-md bg-background/60 text-sm text-foreground backdrop-blur-[1px]">
            <Loader2 className="h-4 w-4 animate-spin" /> Copy-editing…
          </div>
        )}
        {interim && <p className="mt-1 text-sm italic text-muted-foreground">{interim}</p>}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => adapterRef.current && runCopyEdit(adapterRef.current)}
            disabled={busy || status === "preparing"}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Run copy-edit
          </Button>
          {/*
            Only while a rewrite is actually revertible — the snapshot is
            consumed on use, so this comes and goes with it rather than sitting
            there disabled.
          */}
          {undo && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => adapterRef.current && revertCopyEdit(adapterRef.current)}
              disabled={busy}
              title="Restore the text as it was before the last copy-edit"
            >
              <RotateCcw className="h-4 w-4" />
              Revert
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            {status === "ready" && noChange ? "No changes needed" : (STATUS_LABEL[status] ?? "")}
          </span>
        </div>
        <CortiDictationComponent
          authConfig={authConfig}
          dictationConfig={config}
          settingsEnabled={["device", "language", "keybinding"]}
          onTranscript={handleTranscript}
          onCommand={handleCommand}
          onLanguagesChanged={onLanguagesChanged}
        />
      </div>

      {error && <p className="text-sm text-variant-error-foreground">{error}</p>}
    </div>
  );
}
