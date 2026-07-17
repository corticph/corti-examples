import type { RecordingStateChangedEventDetail, TranscriptEventDetail } from "@corti/dictation-web";
import { Loader2, Mic, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CortiDictationComponent } from "../_shared/cortiDictationReact";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import {
  configureVoiceAgent,
  handleFinal,
  handleInterim,
  resetConversation,
  useVoiceAgentStore,
} from "./agent";
import { buildVoiceConfig } from "./config";
import { ORCHESTRATOR_KEY, VOICE_PRESETS } from "./model";

const LANGUAGE = "en";

const STATUS_LABEL: Record<string, string> = {
  preparing: "Preparing...",
  ready: "Ready",
  thinking: "Thinking...",
  responding: "Responding...",
  error: "Error",
};

export function VoiceAgent() {
  const { authConfig, clientId, tenantName, sdkEnvironment } = useCortiAccessToken();
  const {
    status,
    messages,
    interimText,
    isSpeculating,
    heldResponse,
    error,
    responseDebounceMs,
    presetKey,
    detectedMode,
    showProvisionalDetails,
  } = useVoiceAgentStore();

  // In orchestrator mode: show the specialist the LLM detected; else show the selected preset.
  const activeModeLabel =
    presetKey === ORCHESTRATOR_KEY
      ? (VOICE_PRESETS[detectedMode ?? ""]?.label ?? null)
      : (VOICE_PRESETS[presetKey]?.label ?? null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    configureVoiceAgent(authConfig, sdkEnvironment, clientId, tenantName);
  }, [authConfig, sdkEnvironment, clientId, tenantName]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages.length, interimText]);

  const dictationConfig = useMemo(() => buildVoiceConfig(LANGUAGE), []);

  const finalBufferRef = useRef<string[]>([]);
  const finalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushFinal = useCallback(() => {
    finalTimerRef.current = null;
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

      if (!data.isFinal) {
        handleInterim(data.text);
        // New interim means user is still speaking — extend the debounce window if active
        if (finalTimerRef.current) {
          clearTimeout(finalTimerRef.current);
          finalTimerRef.current = setTimeout(flushFinal, responseDebounceMs);
        }
      } else {
        finalBufferRef.current.push(data.text);
        if (finalTimerRef.current) {
          clearTimeout(finalTimerRef.current);
        }
        finalTimerRef.current = setTimeout(flushFinal, responseDebounceMs);
        handleInterim(data.text);
      }
    },
    [flushFinal, responseDebounceMs],
  );

  const handleRecordingState = useCallback(
    (e: CustomEvent<RecordingStateChangedEventDetail>) => {
      const recording = e.detail?.state === "recording";
      setIsRecording(recording);
      // Recording stopped — flush buffered finals immediately rather than waiting
      if (!recording && finalTimerRef.current) {
        clearTimeout(finalTimerRef.current);
        flushFinal();
      }
    },
    [flushFinal],
  );

  const showGhost = isRecording && Boolean(interimText);
  // Response is pre-computed and waiting; spinner gone, ghost dims to signal readiness
  const ghostReady = showGhost && Boolean(heldResponse) && !isSpeculating;
  const showThinkingInline = status === "thinking";
  const busyStatus = status === "thinking" || status === "preparing";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Voice agent</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Speak freely, and the agent will orchestrate the request and respond accordingly based on
          the supported specialists listed below. Responses are pre-fetched during speech and will
          finalize when you finish talking.
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
            {messages.length === 0 && !showGhost && !showThinkingInline ? (
              <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 text-center">
                <Mic className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Start speaking</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Hold the mic button and speak — the agent responds as you finish.
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
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm transition-opacity ${
                        message.role === "user"
                          ? "bg-corti-lime/15 text-foreground ring-1 ring-inset ring-corti-lime/40"
                          : "bg-card text-foreground ring-1 ring-inset ring-border"
                      } ${message.pending ? "opacity-40" : "opacity-100"}`}
                    >
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <span>{message.role === "user" ? "You" : "Agent"}</span>
                      </div>
                      <p
                        className={`whitespace-pre-wrap leading-relaxed ${message.pending ? "italic" : ""}`}
                      >
                        {message.pending && !showProvisionalDetails ? "Responding…" : message.text}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Live interim ghost — shows while user is speaking */}
                {showGhost && (
                  <div className="flex justify-end">
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ring-1 ring-inset transition-opacity ${
                        ghostReady
                          ? "bg-muted/30 ring-corti-lime/20 opacity-50"
                          : "bg-muted/60 ring-border/50 opacity-75"
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/60">
                        <span>You</span>
                        {isSpeculating && <Loader2 className="h-3 w-3 animate-spin" />}
                      </div>
                      <p className="whitespace-pre-wrap italic leading-relaxed text-muted-foreground">
                        {interimText}
                      </p>
                    </div>
                  </div>
                )}

                {/* Thinking bubble — shown when no held response and contextual is in flight */}
                {showThinkingInline && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl bg-card px-4 py-3 text-sm ring-1 ring-inset ring-border">
                      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        Agent
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

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CortiDictationComponent
            authConfig={authConfig}
            dictationConfig={dictationConfig}
            settingsEnabled={["device", "language", "keybinding"]}
            onTranscript={handleTranscript}
            onRecordingStateChanged={handleRecordingState}
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
    </div>
  );
}
