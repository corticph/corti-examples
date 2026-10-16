import type { TranscriptEventDetail } from "@corti/dictation-web";
import { Brain, ChevronRight, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { CortiDictationComponent } from "../_shared/cortiDictationReact";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useHidNoCommands } from "../_shared/useDictationDevice";
import { useDictationLanguage } from "../_shared/useDictationLanguage";
import { cn } from "../_shared/utils";
import {
  clearConversationError,
  clearDebugLog,
  configureConversation,
  handleWakeCommand,
  logFinalTranscript,
  logInterimTranscript,
  logWakeCommand,
  resetConversation,
  sendComposer,
  setAutoSend,
  setComposer,
  useConversationStore,
} from "./agent";
import { buildConversationalConfig } from "./config";
import { type DebugEntry, WAKE_COMMAND_ID } from "./model";

const STATUS_LABEL: Record<string, string> = {
  preparing: "Preparing...",
  ready: "Ready",
  running: "Responding...",
  resetting: "Resetting...",
};

export function WakeCommandAgent() {
  const { authConfig, clientId, tenantName, sdkEnvironment } = useCortiAccessToken();
  const { language, onLanguagesChanged } = useDictationLanguage();
  const { status, error, messages, composer, autoSend, contextId, debugLog } =
    useConversationStore();
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    configureConversation(authConfig, sdkEnvironment, clientId, tenantName);
  }, [authConfig, sdkEnvironment, clientId, tenantName]);

  // The wake command carries {intent} (the spoken utterance); a button press
  // has no utterance, so it's excluded from the command catalog.
  useHidNoCommands("wake-command-agent");

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages.length, status]);

  const dictationConfig = useMemo(() => buildConversationalConfig(language), [language]);

  const handleTranscript = useCallback((e: CustomEvent<TranscriptEventDetail>) => {
    const data = e.detail?.data;
    if (!data || Array.isArray(data)) {
      return;
    }
    if (data.isFinal) {
      logFinalTranscript(data.text);
    } else {
      logInterimTranscript(data.text);
    }
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
            onLanguagesChanged={onLanguagesChanged}
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

      <DebugLogPanel entries={debugLog} onClear={clearDebugLog} />
    </div>
  );
}

function formatDebugTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}:${pad(d.getMilliseconds(), 3)}`;
}

const TYPE_COLORS: Record<string, string> = {
  "session-config": "",
  "interim-transcript": "text-muted-foreground",
  "final-transcript": "text-blue-600 dark:text-blue-400",
  command: "text-corti-lime",
  "agent-request": "text-purple-600 dark:text-purple-400",
  "agent-response": "text-purple-600 dark:text-purple-400",
  "agent-error": "text-red-600 dark:text-red-400",
};

function DebugLogRow({ entry }: { entry: DebugEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = entry.text.length > 120 || entry.data !== undefined;
  const color = TYPE_COLORS[entry.type] ?? "";

  return (
    <div>
      <div className="flex items-start gap-2">
        {hasDetail ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
          </button>
        ) : (
          <span className="mt-0.5 w-3 shrink-0" />
        )}
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {formatDebugTime(entry.at)}
        </span>
        <span className={cn("shrink-0 text-[11px] font-medium", color)}>{entry.type}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-foreground">{entry.text}</span>
      </div>
      {expanded && hasDetail && (
        <pre className="ml-10 mt-0.5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 text-[11px] text-muted-foreground">
          {entry.data !== undefined ? JSON.stringify(entry.data, null, 2) : entry.text}
        </pre>
      )}
    </div>
  );
}

function DebugLogPanel({ entries, onClear }: { entries: DebugEntry[]; onClear: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Debug log
          </p>
          <p className="text-xs text-muted-foreground">
            Session config, transcripts, commands, agent requests and responses.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClear}>
          <Trash2 className="h-4 w-4" /> Clear
        </Button>
      </div>
      <div className="flex max-h-64 flex-col gap-1 overflow-auto rounded-md border border-border bg-background p-3">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">No entries yet.</p>
        ) : (
          entries.map((entry) => <DebugLogRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
