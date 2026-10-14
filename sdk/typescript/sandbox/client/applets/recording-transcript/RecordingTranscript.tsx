/**
 * Applet — CONCEPT: the REST recording-to-transcript pipeline
 * (`client.interactions.create` → `client.recordings.upload` →
 * `client.transcripts.create` with `async: true` → poll `getStatus` →
 * `client.transcripts.get`), the third STT surface alongside `/transcribe`
 * and `/streams`: no live socket, just an uploaded file and a job to poll.
 *
 * Upload any audio file, pick a primary language, and run the pipeline.
 * Each request fires only after the previous one resolves — there is no way
 * to create a transcript before the recording exists on the interaction.
 * RTFx is computed the same way the sandbox's own REST tester computes it:
 * real audio duration (read client-side) divided by wall clock from the
 * first POST to the completed status.
 */

import type { Corti } from "@corti/sdk";
import { CortiClient } from "@corti/sdk";
import { CheckCircle2, CircleDashed, FileAudio, Loader2, Upload, XCircle } from "lucide-react";
import { useState } from "react";
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
import { useSessionState } from "../_shared/sessionState";
import { useCortiAccessToken } from "../_shared/useCortiAccessToken";
import {
  describeTranscriptError,
  type PipelineProgress,
  type PipelineResult,
  type PipelineStep,
  PRIMARY_LANGUAGES,
  runRecordingTranscriptPipeline,
} from "./pipeline";

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

function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function RecordingTranscript() {
  const { authConfig, sdkEnvironment } = useCortiAccessToken();
  const [file, setFile] = useSessionState<File | null>("file", null);
  const [primaryLanguage, setPrimaryLanguage] = useSessionState("primaryLanguage", "en");
  const [diarize, setDiarize] = useSessionState("diarize", true);
  const [progress, setProgress] = useSessionState<PipelineProgress | null>("progress", null);
  const [result, setResult] = useSessionState<PipelineResult | null>("result", null);
  const [error, setError] = useSessionState<string | null>("error", null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!file) {
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      const client = new CortiClient({ environment: sdkEnvironment, auth: authConfig });
      const pipelineResult = await runRecordingTranscriptPipeline(client, {
        file,
        primaryLanguage,
        diarize,
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
          Recording to transcript, end to end
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload an audio file and run the full REST pipeline: create an interaction, upload the
          recording, create an async transcript, and poll it to completion.
        </p>
      </div>

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
            <span className="truncate">{file ? file.name : "Choose an audio file…"}</span>
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
          <Select value={primaryLanguage} onValueChange={setPrimaryLanguage}>
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

      <div className="flex items-center gap-2.5">
        <Switch checked={diarize} onCheckedChange={setDiarize} id="diarize" />
        <Label htmlFor="diarize" className="text-sm">
          diarize (separate speakers within the audio channel)
        </Label>
      </div>

      <div>
        <Button onClick={run} disabled={!file || running}>
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileAudio className="h-4 w-4" />
          )}
          Run pipeline
        </Button>
      </div>

      {(running || progress) && (
        <div className="space-y-2 rounded-md border border-border p-3">
          {STEPS.map((step) => {
            const state = stepState(step.id, progress, !!result, !!error);
            return (
              <div key={step.id} className="flex items-center gap-2 text-sm">
                {state === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-corti-lime" />}
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
                  className={cn(state === "pending" ? "text-muted-foreground" : "text-foreground")}
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

      {error && <p className="text-sm text-variant-error-foreground">{error}</p>}

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                "border-variant-success-border bg-variant-success-bg text-variant-success-text",
              )}
            >
              <CheckCircle2 className="h-3 w-3" />
              Done · {result.timing.rtfx > 0 ? `${result.timing.rtfx.toFixed(1)}×` : "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatMs(result.timing.audioDurationMs)} of audio in{" "}
              {formatMs(result.timing.wallClockMs)} wall clock
            </span>
          </div>

          <div className="space-y-2">
            {result.transcripts.length === 0 && (
              <p className="text-sm text-muted-foreground">No speech detected in this recording.</p>
            )}
            {result.transcripts.map((t: Corti.CommonTranscriptResponse) => (
              <div key={t.start} className="rounded-md border border-border p-2.5 text-sm">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border px-1.5 py-0.5 font-mono">
                    speaker {t.speakerId}
                  </span>
                  <span>
                    {formatMs(t.start)} → {formatMs(t.end)}
                  </span>
                </div>
                <p className="text-foreground">{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
