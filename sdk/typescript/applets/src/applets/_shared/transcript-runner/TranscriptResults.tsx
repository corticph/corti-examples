/**
 * Presentational result surfaces shared by the transcript-runner applets: the
 * run-metadata id grid, the flattened-transcript output card (with JSON view +
 * download actions), and the raw-JSON dialog. All logic-free.
 */
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  buildTranscriptJsonFilename,
  type InteractionSummary,
  type TranscriptResponse,
  type TranscriptRunState,
} from "./model";

function formatTimestamp(value?: string) {
  if (!value) return "Unknown";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Date(timestamp).toLocaleString();
}

interface MetadataCellProps {
  label: string;
  value: string;
  mono?: boolean;
}

function MetadataCell({ label, value, mono = true }: MetadataCellProps) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 text-xs text-foreground${mono ? " break-all font-mono" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

export interface TranscriptRunMetadataProps {
  runState: TranscriptRunState;
  selectedInteraction?: InteractionSummary;
}

export function TranscriptRunMetadata({
  runState,
  selectedInteraction,
}: TranscriptRunMetadataProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Run metadata
          </h3>
          <p className="text-xs text-muted-foreground">
            Useful ids and status for debugging transcript jobs.
          </p>
        </div>
        {runState.transcriptStatus && (
          <Badge variant="outline">{runState.transcriptStatus}</Badge>
        )}
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
        <MetadataCell
          label="Interaction"
          value={runState.interactionId || "Not assigned yet"}
        />
        <MetadataCell
          label="Recording"
          value={runState.recordingId || "Not assigned yet"}
        />
        <MetadataCell
          label="Transcript"
          value={runState.transcriptId || "Not assigned yet"}
        />
        <MetadataCell
          label="Selected interaction updated"
          mono={false}
          value={
            selectedInteraction
              ? formatTimestamp(selectedInteraction.updatedAt)
              : "Unknown"
          }
        />
      </div>
    </section>
  );
}

export interface TranscriptOutputCardProps {
  runState: TranscriptRunState;
  /** Namespaces the JSON download filename, e.g. `corti-second-pass-transcript`. */
  downloadPrefix?: string;
  title?: string;
  description?: string;
  rows?: number;
  onViewJson: () => void;
}

function downloadTranscriptJson(
  transcriptId: string,
  payload: unknown,
  prefix?: string,
) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildTranscriptJsonFilename(transcriptId, prefix);
  link.click();
  URL.revokeObjectURL(url);
}

export function TranscriptOutputCard({
  runState,
  downloadPrefix,
  title = "Transcript output",
  description = "Flattened to one concatenated string for review.",
  rows = 16,
  onViewJson,
}: TranscriptOutputCardProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onViewJson}
            disabled={!runState.transcriptJson}
          >
            View JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              runState.transcriptJson &&
              runState.transcriptId &&
              downloadTranscriptJson(
                runState.transcriptId,
                runState.transcriptJson,
                downloadPrefix,
              )
            }
            disabled={!runState.transcriptJson || !runState.transcriptId}
          >
            <Download className="h-4 w-4" /> Download JSON
          </Button>
        </div>
      </div>

      <Textarea
        value={runState.transcriptText}
        readOnly
        rows={rows}
        placeholder="Transcript output will appear here after /transcripts completes."
        className="resize-y font-mono text-xs"
      />
    </section>
  );
}

export interface TranscriptJsonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transcriptJson: TranscriptResponse | null;
}

export function TranscriptJsonDialog({
  open,
  onOpenChange,
  transcriptJson,
}: TranscriptJsonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Transcript JSON</DialogTitle>
          <DialogDescription>
            Finalized transcript payload returned by{" "}
            <code>
              GET /interactions/{"{id}"}/transcripts/{"{transcriptId}"}
            </code>
            .
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[65vh] rounded-md border border-border bg-muted/20">
          <pre className="whitespace-pre-wrap p-4 text-xs text-foreground">
            {transcriptJson
              ? JSON.stringify(transcriptJson, null, 2)
              : "No transcript JSON loaded yet."}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
