export function FileTranscriptionDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-muted-foreground">
        Not all audio arrives live. A dictaphone recording, a call recording pulled from a PBX, or a
        file a clinician uploads after the fact all need the same thing: a transcript from
        pre-recorded audio. This applet uses the <code>/transcripts</code> REST endpoint for offline
        transcription — no live socket, no microphone.
      </p>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pipeline
        </p>
        <ol className="ml-4 mt-1 list-decimal space-y-1 text-muted-foreground">
          <li>
            <strong>Create an interaction</strong> — every recording and transcript belongs to one.
          </li>
          <li>
            <strong>Upload or select a recording</strong> — upload an audio file from disk, or pick
            a recording already attached to an existing interaction.
          </li>
          <li>
            <strong>Create an async transcript</strong> — the API returns immediately with a
            processing status instead of holding the request open.
          </li>
          <li>
            <strong>Poll until done</strong> — the applet polls in the background and renders the
            finalized transcript and raw JSON when the job completes.
          </li>
        </ol>
      </div>

      <p className="text-muted-foreground">
        File upload, interaction browsing, transcript polling, and JSON export are provided by the
        shared transcript runner, so this applet is a thin composition — no second-pass or review
        step. For the full pipeline guide with async semantics and RTFx timing, see the recording to
        transcript applet.
      </p>
    </div>
  );
}
