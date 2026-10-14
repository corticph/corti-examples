/**
 * Applet — CONCEPT: playback highlighting (karaoke-style synced transcript)
 *
 * Two modes:
 *  - File processing: upload an audio file, run the REST transcript pipeline
 *    with `wordLevel: { enabled: true }`, then play back the audio with synced
 *    highlighting.
 *  - Live streaming: dictate into the microphone via the Corti dictation web
 *    component, then stop to replay the captured audio with synced highlighting.
 *
 * Both modes share the same `SyncedTranscriptPlayer` — the only difference is
 * the segment source (REST pipeline vs live WebSocket) and the audio source
 * (uploaded file vs parallel MediaRecorder capture).
 */

import {
  CheckCircle2,
  CircleDashed,
  FileAudio,
  Highlighter,
  Loader2,
  Mic,
  Settings2,
  Upload,
  XCircle,
} from "lucide-react";
import { CortiClient } from "@corti/sdk";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { cn } from "../../lib/utils";
import { DEFAULT_FORMATTING } from "../_shared/formatting";
import type { FormattingConfig } from "../_shared/types";
import { useSessionState } from "../_shared/sessionState";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import { FormattingFields } from "../formatting/FormattingDialog";
import {
  describeTranscriptError,
  type PipelineProgress,
  type PipelineResult,
  type PipelineStep,
  PRIMARY_LANGUAGES,
  runPlaybackHighlightingPipeline,
} from "./pipeline";
import { SyncedTranscriptPlayer } from "./SyncedTranscriptPlayer";
import { LiveDictationPanel } from "./LiveDictationPanel";

type AppletMode = "file" | "live";

const STEPS: { id: PipelineStep; label: string }[] = [
  { id: "creating-interaction", label: "Create interaction" },
  { id: "uploading-recording", label: "Upload recording" },
  { id: "creating-transcript", label: "Create transcript (async: true)" },
  { id: "polling", label: "Poll transcript status" },
  { id: "fetching-result", label: "Fetch finalized transcript" },
];

function stepState(
  stepId: PipelineStep,
  progress: PipelineProgress | null,
  done: boolean,
  errored: boolean,
): "pending" | "active" | "done" | "error" {
  if (!progress) {
    return "pending";
  }
  const stepIndex = STEPS.findIndex((s) => s.id === stepId);
  const currentIndex = STEPS.findIndex((s) => s.id === progress.step);
  if (done) {
    return "done";
  }
  if (errored && stepIndex === currentIndex) {
    return "error";
  }
  if (stepIndex < currentIndex) {
    return "done";
  }
  if (stepIndex === currentIndex) {
    return "active";
  }
  return "pending";
}

export function PlaybackHighlighting() {
  const { sdkEnvironment, authConfig, isReady } = useCortiAccessToken();
  const [mode, setMode] = useSessionState<AppletMode>("mode", "file");
  const client = useMemo(() => {
    if (!isReady || !authConfig.accessToken) {
      return null;
    }
    return new CortiClient({ environment: sdkEnvironment, auth: authConfig });
  }, [sdkEnvironment, authConfig, isReady]);
  const [file, setFile] = useSessionState<File | null>("file", null);
  const [primaryLanguage, setPrimaryLanguage] = useSessionState(
    "primaryLanguage",
    "en",
  );
  const [diarize, setDiarize] = useSessionState("diarize", false);
  const [wordLevel, setWordLevel] = useSessionState("wordLevel", true);
  const [automaticPunctuation, setAutomaticPunctuation] = useSessionState(
    "automaticPunctuation",
    false,
  );
  const [spokenPunctuation, setSpokenPunctuation] = useSessionState(
    "spokenPunctuation",
    true,
  );
  const [formatting, setFormatting] = useSessionState<FormattingConfig>(
    "formatting",
    DEFAULT_FORMATTING,
  );
  const [showFormatting, setShowFormatting] = useState(false);
  const [progress, setProgress] = useSessionState<PipelineProgress | null>(
    "progress",
    null,
  );
  const [result, setResult] = useSessionState<PipelineResult | null>(
    "result",
    null,
  );
  const [error, setError] = useSessionState<string | null>("error", null);
  const [running, setRunning] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!result || !file) {
      return;
    }
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setAudioUrl(null);
    };
  }, [result, file]);

  const run = async () => {
    if (!file || !client) {
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      const pipelineResult = await runPlaybackHighlightingPipeline(client, {
        file,
        primaryLanguage,
        diarize,
        wordLevel,
        automaticPunctuation,
        spokenPunctuation,
        formatting,
        onProgress: setProgress,
      });
      setResult(pipelineResult);
    } catch (e) {
      setError(describeTranscriptError(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Playback highlighting — synced transcript
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "file"
            ? "Upload an audio file and click 'Run pipeline' to create a transcript. Use the playback controls to see synced transcript highlighting."
            : "Dictate into the microphone, then stop to replay the captured audio with synced highlighting."}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("file")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
            mode === "file"
              ? "border-lime-600 bg-lime-600/10 text-foreground dark:border-corti-lime dark:bg-corti-lime/10"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <FileAudio className="h-4 w-4" />
          File processing
        </button>
        <button
          type="button"
          onClick={() => setMode("live")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
            mode === "live"
              ? "border-lime-600 bg-lime-600/10 text-foreground dark:border-corti-lime dark:bg-corti-lime/10"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Mic className="h-4 w-4" />
          Live streaming
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2.5">
          <Switch
            checked={wordLevel}
            onCheckedChange={setWordLevel}
            id="wordLevel"
          />
          <Label htmlFor="wordLevel" className="text-sm">
            wordLevel
          </Label>
        </div>
        <div className="flex items-center gap-2.5">
          <Switch
            checked={spokenPunctuation}
            onCheckedChange={setSpokenPunctuation}
            id="spokenPunctuation"
          />
          <Label htmlFor="spokenPunctuation" className="text-sm">
            spokenPunctuation
          </Label>
        </div>
        <div className="flex items-center gap-2.5">
          <Switch
            checked={automaticPunctuation}
            onCheckedChange={setAutomaticPunctuation}
            id="automaticPunctuation"
          />
          <Label htmlFor="automaticPunctuation" className="text-sm">
            automaticPunctuation
          </Label>
        </div>
        <div className="flex items-center gap-2.5">
          <Switch
            checked={diarize}
            onCheckedChange={setDiarize}
            id="diarize"
            disabled={mode === "live"}
          />
          <Label htmlFor="diarize" className={cn("text-sm", mode === "live")}>
            diarize {mode === "live"}
          </Label>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFormatting((v) => !v)}
          className="gap-2"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Formatting
        </Button>
      </div>

      {showFormatting && (
        <div className="rounded-md border border-border p-3">
          <FormattingFields
            value={formatting}
            onChange={setFormatting}
            onReset={() => setFormatting(DEFAULT_FORMATTING)}
          />
        </div>
      )}

      {mode === "live" ? (
        <LiveDictationPanel
          wordLevel={wordLevel}
          automaticPunctuation={automaticPunctuation}
          spokenPunctuation={spokenPunctuation}
          formatting={formatting}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Audio file</Label>
              <label
                className={cn(
                  "flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground",
                  file && "border-solid text-foreground",
                )}
              >
                <Upload className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {file ? file.name : "Choose an audio file…"}
                </span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Primary language</Label>
              <Select
                value={primaryLanguage}
                onValueChange={setPrimaryLanguage}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIMARY_LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Button onClick={run} disabled={!file || running || !isReady}>
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Highlighter className="h-4 w-4" />
              )}
              Run pipeline
            </Button>
          </div>

          {(running || progress) && (
            <div className="space-y-2 rounded-md border border-border p-3">
              {STEPS.map((step) => {
                const state = stepState(step.id, progress, !!result, !!error);
                return (
                  <div
                    key={step.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    {state === "done" && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-lime-600 dark:text-corti-lime" />
                    )}
                    {state === "active" && (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-foreground" />
                    )}
                    {state === "pending" && (
                      <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    {state === "error" && (
                      <XCircle className="h-4 w-4 shrink-0 text-variant-error-foreground" />
                    )}
                    <span
                      className={cn(
                        state === "pending"
                          ? "text-muted-foreground"
                          : "text-foreground",
                      )}
                    >
                      {step.label}
                      {step.id === "polling" &&
                        state === "active" &&
                        progress?.pollAttempt &&
                        ` (attempt ${progress.pollAttempt})`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {error && (
            <p className="text-sm text-variant-error-foreground">{error}</p>
          )}

          {result && audioUrl && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                    "border-variant-success-border bg-variant-success-bg text-variant-success-text",
                  )}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Done
                </span>
                <span className="text-xs text-muted-foreground">
                  {result.transcripts.length}{" "}
                  {result.wordLevel ? "words" : "segments"} ·{" "}
                  {result.wallClockMs >= 1000
                    ? `${(result.wallClockMs / 1000).toFixed(1)}s`
                    : `${result.wallClockMs}ms`}{" "}
                  to complete
                </span>
              </div>

              <SyncedTranscriptPlayer
                segments={result.transcripts}
                audioUrl={audioUrl}
                diarize={diarize}
                wordLevel={result.wordLevel}
                primaryLanguage={primaryLanguage}
                rawResponse={result.rawResponse}
                transcriptId={result.transcriptId}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
