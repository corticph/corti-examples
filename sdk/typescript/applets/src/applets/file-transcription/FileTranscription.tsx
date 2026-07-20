import { Upload } from "lucide-react";
import { useState } from "react";
import {
  TranscriptJsonDialog,
  TranscriptOutputCard,
  TranscriptRunMetadata,
  TranscriptRunnerForm,
  useTranscriptRunner,
} from "../_shared/transcript-runner";

export function FileTranscription() {
  const runner = useTranscriptRunner();
  const [jsonOpen, setJsonOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-foreground">File transcription</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Upload an audio file or reuse an existing interaction recording, then generate an offline
          transcript through <code>/transcripts</code>. This applet showcases asynchronous
          transcript generation and polling for final results.
        </p>
      </div>

      <TranscriptRunnerForm
        runner={runner}
        idPrefix="file-transcription"
        description="Configure transcript generation, then create a file-based transcript job."
        actionLabel="Generate transcript"
        actionIcon={<Upload className="h-4 w-4" />}
        onGenerate={() => {
          setJsonOpen(false);
          void runner.generate();
        }}
      />

      <TranscriptRunMetadata
        runState={runner.runState}
        selectedInteraction={runner.selectedInteraction}
      />

      <TranscriptOutputCard runState={runner.runState} onViewJson={() => setJsonOpen(true)} />

      <TranscriptJsonDialog
        open={jsonOpen}
        onOpenChange={setJsonOpen}
        transcriptJson={runner.runState.transcriptJson}
      />
    </div>
  );
}
