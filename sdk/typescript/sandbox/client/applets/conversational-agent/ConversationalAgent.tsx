import type {
  AudioEventEventDetail,
  RecordingStateChangedEventDetail,
  TranscriptEventDetail,
} from "@corti/dictation-web";
import { ChevronRight, Download, Loader2, Mic, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CortiDictationComponent } from "../_shared/cortiDictationReact";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { useDictationLanguage } from "../_shared/useDictationLanguage";
import { cn } from "../_shared/utils";
import {
  clearDebugLog,
  configureConversationalAgent,
  type DebugLogEntry,
  handleAudioEvent,
  handleFinal,
  handleInterim,
  resetConversation,
  TURN_MODE_DEBOUNCE_MS,
  useConversationalAgentStore,
  useDebugLogStore,
} from "./agent";
import { buildVoiceConfig } from "./config";
import { ORCHESTRATOR_KEY, VOICE_PRESETS } from "./model";

const STATUS_LABEL: Record<string, string> = {
  preparing: "Preparing...",
  ready: "Ready",
  thinking: "Thinking...",
  responding: "Responding...",
  error: "Error",
};

export function ConversationalAgent() {
  const { authConfig, clientId, tenantName, sdkEnvironment } = useCortiAccessToken();
  const { language, onLanguagesChanged } = useDictationLanguage();
  const { status, messages, interimText, error, turnMode, presetKey, detectedMode } =
    useConversationalAgentStore();

  const activeModeLabel =
    presetKey === ORCHESTRATOR_KEY
      ? (VOICE_PRESETS[detectedMode ?? ""]?.label ?? null)
      : (VOICE_PRESETS[presetKey]?.label ?? null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [_isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    configureConversationalAgent(authConfig, sdkEnvironment, clientId, tenantName);
  }, [authConfig, sdkEnvironment, clientId, tenantName]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages.length, interimText, status]);

  const dictationConfig = useMemo(() => buildVoiceConfig(language), [language]);

  const finalBufferRef = useRef<string[]>([]);
  const transcriptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doFlush = useCallback(() => {
    const text = finalBufferRef.current.join(" ").trim();
    finalBufferRef.current = [];
    if (text) {
      void handleFinal(text);
    }
  }, []);

  const handleTranscript = useCallback(
    (e: CustomEvent<TranscriptEventDetail>) => {
      const data = e.detail?.data;
      if (!data || Array.isArray(data)) {
        return;
      }

      if (transcriptTimerRef.current) {
        clearTimeout(transcriptTimerRef.current);
        transcriptTimerRef.current = null;
      }
      if (turnMode !== "deliberate") {
        transcriptTimerRef.current = setTimeout(doFlush, TURN_MODE_DEBOUNCE_MS[turnMode]);
      }

      if (!data.isFinal) {
        handleInterim(data.text);
      } else {
        finalBufferRef.current.push(data.text);
        handleInterim(data.text);
      }
    },
    [doFlush, turnMode],
  );

  const handleRecordingState = useCallback(
    (e: CustomEvent<RecordingStateChangedEventDetail>) => {
      const recording = e.detail?.state === "recording";
      setIsRecording(recording);
      if (!recording) {
        if (transcriptTimerRef.current) {
          clearTimeout(transcriptTimerRef.current);
          transcriptTimerRef.current = null;
        }
        doFlush();
      }
    },
    [doFlush],
  );

  const handleAudioEventWrapper = useCallback(
    (e: CustomEvent<AudioEventEventDetail>) => {
      const eventType = e.detail?.data?.event;
      if (eventType) {
        handleAudioEvent(eventType);
        if (turnMode === "deliberate" && eventType === "longSilenceDetected") {
          doFlush();
        }
      }
    },
    [doFlush, turnMode],
  );

  const showGhost = Boolean(interimText) && status !== "thinking";
  const busyStatus = status === "thinking" || status === "preparing";

  const lastMessage = messages[messages.length - 1];
  const isStreaming =
    status === "thinking" && lastMessage?.role === "assistant" && lastMessage.text.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Conversational agent</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Speak freely, and the agent will orchestrate the request and respond accordingly based on
          the supported specialists listed below. Responses stream incrementally via SSE for minimal
          latency.
        </p>
      </div>

      <div className="min-h-[28rem] rounded-xl border border-border bg-muted/45">
        {activeModeLabel && (
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Mode</span>
            <span className="rounded-full bg-corti-lime/15 px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-inset ring-corti-lime/50">
              {activeModeLabel}
            </span>
          </div>
        )}
        <ScrollArea className="h-[28rem]" viewportRef={viewportRef}>
          <div className="flex min-h-full flex-col gap-3 p-4">
            {messages.length === 0 && !showGhost && status !== "thinking" ? (
              <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 text-center">
                <Mic className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Start speaking</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Hold the mic button and speak — the agent streams its response as you finish.
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
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <span>{message.role === "user" ? "You" : "Agent"}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {message.text || (
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Thinking...</span>
                          </span>
                        )}
                        {isStreaming && message.id === lastMessage.id && (
                          <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-foreground align-text-bottom" />
                        )}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Live interim ghost — shows while user is speaking */}
                {showGhost && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl bg-muted/60 px-4 py-3 text-sm ring-1 ring-inset ring-border/50 opacity-75">
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/60">
                        <span>You</span>
                      </div>
                      <p className="whitespace-pre-wrap italic leading-relaxed text-muted-foreground">
                        {interimText}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CortiDictationComponent
            authConfig={authConfig}
            dictationConfig={dictationConfig}
            settingsEnabled={["device", "language", "keybinding"]}
            onTranscript={handleTranscript}
            onRecordingStateChanged={handleRecordingState}
            onAudioEvent={handleAudioEventWrapper}
            onLanguagesChanged={onLanguagesChanged}
          />

          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-1.5">
              {busyStatus && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {STATUS_LABEL[status] ?? "Idle"}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void resetConversation()}
              disabled={busyStatus}
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Mic control and configuration</span>
          <span>
            {messages.length} {messages.length === 1 ? "message" : "messages"}
          </span>
        </div>

        {error && <p className="text-sm text-variant-error-foreground">{error}</p>}
      </div>

      <DebugLogPanel />
    </div>
  );
}

const EVENT_COLORS: Record<string, string> = {
  interim: "text-muted-foreground",
  final_flushed: "text-blue-600 dark:text-blue-400",
  turn_merged: "text-amber-600 dark:text-amber-400",
  agent_stream_start: "text-purple-600 dark:text-purple-400",
  agent_stream_chunk: "text-purple-600 dark:text-purple-400",
  agent_stream_done: "text-purple-600 dark:text-purple-400",
  agent_error: "text-red-600 dark:text-red-400",
  mode_detected: "text-corti-lime",
  audio_event: "text-muted-foreground",
  session_config: "text-foreground",
};

function DebugLogRow({ entry }: { entry: DebugLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const color = EVENT_COLORS[entry.event] ?? "";

  return (
    <div>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
        </button>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          +{String(entry.tMs).padStart(6)}ms
        </span>
        <span className={cn("shrink-0 text-[11px] font-medium", color)}>{entry.event}</span>
        {entry.latencyMs != null && (
          <span className="shrink-0 text-[11px] text-muted-foreground">({entry.latencyMs}ms)</span>
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-foreground">{entry.text}</span>
      </div>
      {expanded && (
        <pre className="ml-10 mt-0.5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 text-[11px] text-muted-foreground">
          {entry.fullText ?? entry.text}
        </pre>
      )}
    </div>
  );
}

function DebugLogPanel() {
  const debugLog = useDebugLogStore();

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Debug log
          </p>
          <p className="text-xs text-muted-foreground">
            Interim transcripts, turn merges, agent stream events, mode detection.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={debugLog.length === 0}
            onClick={() => {
              const text = debugLog
                .map(
                  (e) =>
                    `+${String(e.tMs).padStart(6)}ms  ${e.event.padEnd(24)} ${e.text}${e.latencyMs != null ? `  (${e.latencyMs}ms)` : ""}`,
                )
                .join("\n");
              void navigator.clipboard.writeText(text);
            }}
          >
            Copy
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={debugLog.length === 0}
            onClick={() => {
              const blob = new Blob([JSON.stringify(debugLog, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "conversational-debug-log.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4" /> JSON
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={debugLog.length === 0}
            onClick={clearDebugLog}
          >
            <Trash2 className="h-4 w-4" /> Clear
          </Button>
        </div>
      </div>
      <div className="flex max-h-64 flex-col gap-1 overflow-auto rounded-md border border-border bg-background p-3">
        {debugLog.length === 0 ? (
          <p className="text-xs text-muted-foreground">No entries yet.</p>
        ) : (
          debugLog.map((entry) => <DebugLogRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
