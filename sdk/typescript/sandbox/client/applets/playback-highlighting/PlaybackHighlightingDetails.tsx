export function PlaybackHighlightingDetails() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          wordLevel configuration
        </p>
        <p className="mt-1 text-muted-foreground">
          The <code>wordLevel.enabled</code> parameter (object with a boolean <code>enabled</code>{" "}
          field) tells the API to return one transcript entry per word instead of per phrase. Each
          entry has the same <code>start</code>/<code>end</code> shape (milliseconds for REST), just
          with <code>text</code> being a single word. This gives the most granular timestamps for
          sync-to-audio highlighting. When disabled, the player highlights at phrase granularity
          instead — same code, coarser highlighting.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Timing units
        </p>
        <p className="mt-1 text-muted-foreground">
          REST <code>/transcripts</code> returns <code>start</code> and <code>end</code> as integers
          in <strong>milliseconds</strong>. The HTML <code>audio.currentTime</code> property is in{" "}
          <strong>seconds</strong>. The sync hook multiplies <code>currentTime * 1000</code> before
          comparing against segment timestamps. Click-to-seek does the inverse:{" "}
          <code>word.start / 1000</code>.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Diarization
        </p>
        <p className="mt-1 text-muted-foreground">
          When <code>diarize: true</code> is set, each word/segment carries a <code>speakerId</code>
          . The player inserts a speaker badge at each speaker boundary and color-codes the badge
          text. Consecutive same-speaker words flow together as a single run.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Command detection and sequencing
        </p>
        <p className="mt-1 text-muted-foreground">
          When the server recognizes a configured command phrase, it sends a separate{" "}
          <code>command</code> message with <code>id</code>, <code>variables</code>,{" "}
          <code>rawTranscriptText</code>, and <code>start</code>/<code>end</code> timestamps. The{" "}
          <code>useLiveTranscript</code> hook accumulates these alongside transcript segments. The
          player renders a "Detected commands" list below the transcript — each row shows the
          command id, resolved variables, raw spoken text, and timestamp range. The active command
          highlights during playback when <code>currentTime</code> falls within its range. Click any
          command row to seek the audio to its start.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Multi-recording audio concatenation
        </p>
        <p className="mt-1 text-muted-foreground">
          Multiple recordings accumulate additively — segments, commands, and audio all build on
          prior recordings until "Clear all" is pressed. WebM blob concatenation via{" "}
          <code>new Blob([...blobs])</code> produces unreliable <code>currentTime</code> and{" "}
          <code>Infinity</code> duration because the Matroska container's cluster timestamps don't
          span across blobs. Instead, each WebM blob is decoded to PCM via{" "}
          <code>AudioContext.decodeAudioData</code>, concatenated sample-by-sample, and re-encoded
          as WAV — which has an accurate, continuous timeline derived purely from byte position.
        </p>
        <p className="mt-1 text-muted-foreground">
          Server timestamps are session-relative (they keep climbing through idle gaps between
          recordings). The concatenated audio has no gaps, so <code>useLiveTranscript</code> shifts
          each subsequent recording's timestamps by the cumulative actual MediaRecorder duration of
          prior recordings — not the server's last-word timestamp, which doesn't account for
          trailing silence in the audio.
        </p>
      </div>

      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
        See{" "}
        <a
          className="underline"
          href="https://docs.corti.ai/api-reference/transcripts/create-transcript#body-word-level"
          target="_blank"
          rel="noopener noreferrer"
        >
          docs.corti.ai — create transcript
        </a>{" "}
        for the full <code>wordLevel</code> parameter spec.
      </p>
    </div>
  );
}
