export function FileTranscriptionDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm text-muted-foreground">
      <p>
        Upload an audio file or select a recording for an existing interaction, create an async{" "}
        <code>/transcripts</code> job, poll until completion, then view the finalized transcript and
        raw JSON payload.
      </p>
      <p>
        File upload, interaction browsing, transcript polling, and JSON export are provided by the
        shared transcript runner (<code>_shared/transcript-runner</code>), so this applet is a thin
        composition with no second-pass step.
      </p>
    </div>
  );
}
