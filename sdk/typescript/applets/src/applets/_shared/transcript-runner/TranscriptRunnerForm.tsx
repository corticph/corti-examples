/**
 * Presentational "Inputs" card for the transcript runner: source selection,
 * primary language, the upload/recording target pickers, and the transcribe
 * parameter switches. Logic-free — every value and handler comes from
 * `useTranscriptRunner`. Render extra controls (e.g. an agent prompt editor)
 * via `children`; they appear between the switches and the action button.
 */

import { Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { TranscriptPhase, TranscriptSourceMode, UploadInteractionMode } from "./model";
import type { TranscriptRunner } from "./useTranscriptRunner";

const DEFAULT_PHASE_LABEL: Record<TranscriptPhase, string> = {
  idle: "Idle",
  loading_interactions: "Loading interactions...",
  loading_recordings: "Loading recordings...",
  uploading: "Uploading audio...",
  creating_transcript: "Creating transcript...",
  polling: "Waiting for transcript...",
  second_pass: "Finishing...",
  done: "Done",
  error: "Error",
};

interface InteractionPickerProps {
  idPrefix: string;
  runner: TranscriptRunner;
}

function InteractionPicker({ idPrefix, runner }: InteractionPickerProps) {
  const id = `${idPrefix}-existing-interaction`;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>Interaction ID</Label>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void runner.refreshInteractions()}
          disabled={runner.isRefreshingInteractions}
        >
          {runner.isRefreshingInteractions ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>
      <Select value={runner.selectedInteractionId} onValueChange={runner.setSelectedInteractionId}>
        <SelectTrigger id={id} className="font-mono text-xs">
          <SelectValue placeholder="Select an interaction ID" />
        </SelectTrigger>
        <SelectContent position="item-aligned">
          {runner.interactions.length > 0 ? (
            runner.interactions.map((interaction) => (
              <SelectItem key={interaction.id} value={interaction.id}>
                {interaction.id}
              </SelectItem>
            ))
          ) : (
            <SelectItem value="__none" disabled>
              No interactions available
            </SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

export interface TranscriptRunnerFormProps {
  runner: TranscriptRunner;
  /** Namespaces element ids so two runners can mount on the same page. */
  idPrefix: string;
  /** Sub-heading under the "Inputs" title. */
  description: string;
  /** Action button label, e.g. "Generate transcript". */
  actionLabel: string;
  /** Icon shown on the action button when idle. */
  actionIcon: ReactNode;
  onGenerate: () => void;
  /** Extra disabled conditions beyond busy/invalid inputs. */
  generateDisabled?: boolean;
  /** Phase-badge labels; defaults cover every phase. */
  phaseLabel?: Partial<Record<TranscriptPhase, string>>;
  /** Extra controls rendered between the switches and the action button. */
  children?: ReactNode;
}

export function TranscriptRunnerForm({
  runner,
  idPrefix,
  description,
  actionLabel,
  actionIcon,
  onGenerate,
  generateDisabled = false,
  phaseLabel,
  children,
}: TranscriptRunnerFormProps) {
  const labels = { ...DEFAULT_PHASE_LABEL, ...phaseLabel };
  const disabled = runner.busy || runner.inputsInvalid || generateDisabled;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Inputs</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Badge variant="outline">{labels[runner.runState.phase]}</Badge>
      </div>

      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-source-mode`}>Source</Label>
            <Select
              value={runner.sourceMode}
              onValueChange={(value: TranscriptSourceMode) => runner.setSourceMode(value)}
            >
              <SelectTrigger id={`${idPrefix}-source-mode`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="item-aligned">
                <SelectItem value="upload">Upload audio file</SelectItem>
                <SelectItem value="recording">Existing interaction recording</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-language`}>Primary language</Label>
            <Input
              id={`${idPrefix}-language`}
              value={runner.primaryLanguage}
              onChange={(e) => runner.setPrimaryLanguage(e.target.value)}
              placeholder="en"
              spellCheck={false}
            />
          </div>
        </div>

        {runner.sourceMode === "upload" ? (
          <div className="space-y-4 rounded-lg border border-border/80 bg-muted/30 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-upload-mode`}>Upload target interaction</Label>
                <Select
                  value={runner.uploadInteractionMode}
                  onValueChange={(value: UploadInteractionMode) =>
                    runner.setUploadInteractionMode(value)
                  }
                >
                  <SelectTrigger id={`${idPrefix}-upload-mode`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="item-aligned">
                    <SelectItem value="new">Create new interaction</SelectItem>
                    <SelectItem value="existing">Use existing interaction</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-file`}>Audio file</Label>
                <input
                  id={`${idPrefix}-file`}
                  type="file"
                  accept="audio/*"
                  className="block w-full text-sm text-foreground"
                  onChange={(e) => runner.setFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            {runner.uploadInteractionMode === "existing" && (
              <InteractionPicker idPrefix={idPrefix} runner={runner} />
            )}
          </div>
        ) : (
          <div className="space-y-4 rounded-lg border border-border/80 bg-muted/30 p-4">
            <InteractionPicker idPrefix={idPrefix} runner={runner} />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`${idPrefix}-recording`}>Recording</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void runner.refreshRecordings()}
                  disabled={!runner.selectedInteractionId || runner.isRefreshingRecordings}
                >
                  {runner.isRefreshingRecordings ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh
                </Button>
              </div>
              <Select
                value={runner.selectedRecordingId}
                onValueChange={runner.setSelectedRecordingId}
              >
                <SelectTrigger id={`${idPrefix}-recording`} className="font-mono text-xs">
                  <SelectValue placeholder="Select a recording ID" />
                </SelectTrigger>
                <SelectContent position="item-aligned">
                  {runner.recordings.length > 0 ? (
                    runner.recordings.map((recordingId) => (
                      <SelectItem key={recordingId} value={recordingId}>
                        {recordingId}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__none" disabled>
                      No recordings available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-sm">
            <span>
              <span className="block font-medium text-foreground">Dictation punctuation</span>
              <span className="block text-xs text-muted-foreground">
                Enable spoken punctuation interpretation
              </span>
            </span>
            <Switch
              checked={runner.isDictation}
              onCheckedChange={(checked) => runner.setIsDictation(Boolean(checked))}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-sm">
            <span>
              <span className="block font-medium text-foreground">Multichannel</span>
              <span className="block text-xs text-muted-foreground">
                Transcribe each channel independently
              </span>
            </span>
            <Switch
              checked={runner.isMultichannel}
              onCheckedChange={(checked) => runner.setIsMultichannel(Boolean(checked))}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-sm">
            <span>
              <span className="block font-medium text-foreground">Diarize</span>
              <span className="block text-xs text-muted-foreground">
                Separate speakers within channels
              </span>
            </span>
            <Switch
              checked={runner.diarize}
              onCheckedChange={(checked) => runner.setDiarize(Boolean(checked))}
            />
          </div>
        </div>

        {children}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onGenerate} disabled={disabled}>
              {runner.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : actionIcon}
              {actionLabel}
            </Button>
            {runner.runState.error && (
              <span className="text-sm text-variant-error-foreground">{runner.runState.error}</span>
            )}
          </div>
        </div>

        {runner.browserError && (
          <p className="text-sm text-variant-error-foreground">{runner.browserError}</p>
        )}
      </div>
    </section>
  );
}
