/**
 * Applet — CONCEPT: on-demand agent (agentic copy-edit).
 *
 * Dictate into the editor, then say "copy edit" (or click Run copy-edit) to send
 * the text through a Corti Agentic Framework agent that applies a minimal
 * spelling/grammar/punctuation copy-edit and replaces the text. Wording and
 * content are preserved; the prompt is editable in the details card.
 */

import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CortiDictationComponent } from "../_shared/cortiDictationReact";
import type { EditorAdapter } from "../_shared/editorAdapter";
import { useActiveControl } from "../_shared/useActiveControl";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { COPY_EDIT_COMMAND_ID, configureCopyEdit, runCopyEdit, useCopyEditStore } from "./agent";
import { buildCopyEditConfig } from "./config";

const LANGUAGE = "en";
const CONFIG = buildCopyEditConfig(LANGUAGE);

const STATUS_LABEL: Record<string, string> = {
  preparing: "Preparing agent…",
  running: "Copy-editing…",
  ready: "Agent ready",
};

export function OnDemandAgent() {
  const { authConfig, clientId, tenantName, sdkEnvironment } = useCortiAccessToken();
  const { status, error, noChange } = useCopyEditStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const { adapter } = useActiveControl(containerRef);
  const adapterRef = useRef<EditorAdapter | null>(null);
  adapterRef.current = adapter;
  const [interim, setInterim] = useState("");

  useEffect(() => {
    configureCopyEdit(authConfig, sdkEnvironment, clientId, tenantName);
  }, [authConfig, sdkEnvironment, clientId, tenantName]);

  const handleTranscript = useCallback((e: CustomEvent) => {
    const data = e.detail?.data;
    if (!data || Array.isArray(data)) {
      return;
    }
    if (data.isFinal) {
      setInterim("");
      adapterRef.current?.insert(data.text, { primaryLanguage: LANGUAGE });
    } else {
      setInterim(data.text);
    }
  }, []);

  const handleCommand = useCallback((e: CustomEvent) => {
    if (e.detail?.data?.id === COPY_EDIT_COMMAND_ID && adapterRef.current) {
      runCopyEdit(adapterRef.current);
    }
  }, []);

  useEffect(() => {
    adapterRef.current?.focus();
  }, []);

  const busy = status === "running";

  return (
    <div className="flex flex-col gap-4" ref={containerRef}>
      <div>
        <h2 className="text-lg font-semibold text-foreground">On-demand agent (copy-edit)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dictate, then say “copy edit” (or click Run copy-edit) to send the text through a Corti
          agent for a minimal spelling / grammar / punctuation pass. Wording and clinical content
          are preserved — edit the prompt in the agent card below.
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
          <span className="text-xs text-muted-foreground">
            {status === "ready" && noChange ? "No changes needed" : (STATUS_LABEL[status] ?? "")}
          </span>
        </div>
        <CortiDictationComponent
          authConfig={authConfig}
          dictationConfig={CONFIG}
          settingsEnabled={["device", "language", "keybinding"]}
          onTranscript={handleTranscript}
          onCommand={handleCommand}
        />
      </div>

      {error && <p className="text-sm text-variant-error-foreground">{error}</p>}
    </div>
  );
}
