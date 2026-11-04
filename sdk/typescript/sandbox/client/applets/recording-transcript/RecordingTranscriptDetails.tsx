/** Details card: the REST recording-to-transcript pipeline and its async semantics. */
export function RecordingTranscriptDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Call sequence
        </p>
        <ol className="ml-4 mt-1 list-decimal space-y-1 text-muted-foreground">
          <li>
            <code>client.interactions.create</code> — every recording and transcript belongs to an
            interaction; nothing else works without an <code>interactionId</code> first.
          </li>
          <li>
            <code>client.recordings.upload</code> — the audio file, up to 120 minutes or 150MB,
            attached to that interaction.
          </li>
          <li>
            <code>client.transcripts.create</code> with <code>async: true</code> — returns
            immediately with status <code>processing</code> instead of blocking for up to 25s.
          </li>
          <li>
            <code>client.transcripts.getStatus</code> — polled until <code>completed</code> or{" "}
            <code>failed</code>.
          </li>
          <li>
            <code>client.transcripts.get</code> — the finalized transcript segments, only meaningful
            once status is <code>completed</code>.
          </li>
        </ol>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          async: true
        </p>
        <p className="mt-1 text-muted-foreground">
          Without it, the request processes synchronously for up to 25 seconds before the API falls
          back to background processing anyway — the caller just blocks for the whole window either
          way. Setting it up front returns a <code>202 Accepted</code> right away so the client can
          poll instead of holding a connection open.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">RTFx</p>
        <p className="mt-1 text-muted-foreground">
          Real-time factor: audio duration divided by wall-clock processing time. Audio duration is
          read client-side from the file's own <code>&lt;audio&gt;</code> metadata, not estimated
          from transcript segments, so it reflects the actual upload regardless of how much speech
          Corti detected in it. Wall clock runs from the initial POST to the first{" "}
          <code>completed</code> status.
        </p>
      </div>

      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
        See{" "}
        <a
          className="underline"
          href="https://docs.corti.ai/stt/transcripts"
          target="_blank"
          rel="noopener noreferrer"
        >
          docs.corti.ai/stt/transcripts
        </a>{" "}
        for the full request/response schema and processing-tier notes.
      </p>
    </div>
  );
}
