import type { TranscriptEventDetail } from "@corti/dictation-web";
import { Brain, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { CortiDictationComponent } from "../_shared/cortiDictationReact";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import {
  clearConversationError,
  configureConversation,
  handleWakeCommand,
  logFinalTranscript,
  logWakeCommand,
  resetConversation,
  sendComposer,
  setAutoSend,
  setComposer,
  useConversationStore,
} from "./agent";
import { buildConversationalConfig } from "./config";
import { WAKE_COMMAND_ID } from "./model";

const LANGUAGE = "en";

const STATUS_LABEL: Record<string, string> = {
  preparing: "Preparing...",
  ready: "Ready",
  running: "Responding...",
  resetting: "Resetting...",
};

export function WakeCommandAgent() {
  const { authConfig, clientId, tenantName, sdkEnvironment } = useCortiAccessToken();
  const { status, error, messages, composer, autoSend, contextId } = useConversationStore();
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    configureConversation(authConfig, sdkEnvironment, clientId, tenantName);
  }, [authConfig, sdkEnvironment, clientId, tenantName]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages.length, status]);

  const dictationConfig = useMemo(() => buildConversationalConfig(LANGUAGE), []);

  const handleTranscript = useCallback((e: CustomEvent<TranscriptEventDetail>) => {
    const data = e.detail?.data;
    if (!data || Array.isArray(data) || !data.isFinal) {
      return;
    }
    logFinalTranscript(data.text);
  }, []);

  const onCommand = useCallback(async (e: CustomEvent) => {
    const data = e.detail?.data;
    if (!data || data.id !== WAKE_COMMAND_ID) {
      return;
    }
    logWakeCommand(data);
    await handleWakeCommand(data);
  }, []);

  const busy = status === "running" || status === "resetting";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Wake-command agent</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            A chat-style clinical agent. Type normally, or keep the mic live and speak a
            single-utterance wake command like "okay Corti summarize the plan." STT results that are
            not preceded by the wake command are ignored.
          </p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-h-[28rem] rounded-xl border border-border bg-muted/45">
          <ScrollArea className="h-[28rem]" viewportRef={viewportRef}>
            <div className="flex min-h-full flex-col gap-3 p-4">
              {messages.length === 0 ? (
                <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 text-center">
                  <p className="text-sm font-medium text-foreground">No messages yet</p>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    Dictate a wake command or type a message below. Threaded memory is kept until
                    you reset the conversation.
                  </p>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                          message.role === "user"
                            ? "bg-corti-lime/15 text-foreground ring-1 ring-inset ring-corti-lime/40"
                            : "bg-card text-foreground ring-1 ring-inset ring-border"
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                          <span>{message.role === "user" ? "User" : "Assistant"}</span>
                          <span>{message.source === "voice" ? "Voice" : "Typed"}</span>
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
                      </div>
                    </div>
                  ))}

                  {status === "running" && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl bg-card px-4 py-3 text-sm ring-1 ring-inset ring-border">
                        <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          Assistant
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex flex-col items-stretch gap-3 lg:w-[8.5rem]">
          <CortiDictationComponent
            authConfig={authConfig}
            dictationConfig={dictationConfig}
            settingsEnabled={["device", "language", "keybinding"]}
            onTranscript={handleTranscript}
            onCommand={onCommand}
          />
          <div className="rounded-lg border-border bg-card p-3 text-xs text-muted-foreground">
            <p className="font-semibold tracking-wide text-foreground">Wake phrases</p>
            <p className="mt-2">"hey Corti ..."</p>
            <p>"ok Corti ..."</p>
          </div>
          <div className="rounded-lg border-border bg-card p-3 text-xs text-muted-foreground"></div>
          <Badge variant="outline" className="gap-1.5 self-start">
            <Brain className="h-4 w-4" />
            {STATUS_LABEL[status] ?? "Idle"}
          </Badge>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 text-sm text-foreground">
            <Switch
              checked={autoSend}
              onCheckedChange={(checked) => setAutoSend(Boolean(checked))}
            />
            <span>Auto-send wake-command intents instead of landing them in the composer</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {contextId ? "Thread active" : "New thread on next send"}
          </div>
        </div>

        <textarea
          value={composer}
          onChange={(e) => {
            clearConversationError();
            setComposer(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendComposer();
            }
          }}
          rows={4}
          spellCheck={false}
          placeholder="Type a clinical question, or dictate a wake-command to drop text here for review..."
          className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-corti-lime"
        />

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Press Enter to send. Use Shift+Enter for a new line.
          </p>
          <Button onClick={() => void sendComposer()} disabled={busy}>
            {status === "running" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Sending...
              </>
            ) : (
              "Send"
            )}
          </Button>
        </div>

        <div className="mt-3 flex items-start justify-between gap-6">
          <div className="text-left text-xs text-muted-foreground"></div>

          <div className="flex flex-col items-end gap-2 text-right">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void resetConversation()}
              disabled={status === "resetting"}
            >
              <RotateCcw className="h-4 w-4" /> Reset thread
            </Button>
            <p className="text-xs text-muted-foreground">
              {messages.length} messages in current context.
            </p>
            <p className="text-xs text-muted-foreground">
              Reset clears agent context and local thread state.
            </p>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-variant-error-foreground">{error}</p>}
      </div>
    </div>
  );
}
