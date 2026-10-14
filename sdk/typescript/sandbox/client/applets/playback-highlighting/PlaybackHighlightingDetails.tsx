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
          Corti SDK
        </p>
        <p className="mt-1 text-muted-foreground">
          The applet uses the <code>@corti/sdk</code> <code>CortiClient</code> for all REST calls —{" "}
          <code>interactions.create</code>, <code>recordings.upload</code>,{" "}
          <code>transcripts.create</code>, <code>transcripts.getStatus</code>, and{" "}
          <code>transcripts.get</code>. The transcript create request accepts <code>wordLevel</code>
          , <code>async</code>, <code>automaticPunctuation</code>, <code>spokenPunctuation</code>,
          and <code>formatting</code> alongside the standard <code>recordingId</code>,{" "}
          <code>primaryLanguage</code>, and <code>diarize</code> fields. The client is instantiated
          with an environment and auth config from <code>useCortiAccessToken</code>.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          requestAnimationFrame vs timeupdate
        </p>
        <p className="mt-1 text-muted-foreground">
          The browser's <code>timeupdate</code> event fires roughly 4 times per second (~250ms gaps)
          — too choppy for word-level highlighting where individual words can be shorter than 250ms.
          A <code>requestAnimationFrame</code> loop checks <code>audio.currentTime</code> every
          frame (~16ms) and binary-searches the sorted segment array for the last entry whose{" "}
          <code>start</code> &lt;= current time — O(log n) per frame, smooth at 60fps even for long
          transcripts with thousands of word entries.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Text spacing, casing, and line breaks
        </p>
        <p className="mt-1 text-muted-foreground">
          Follows the{" "}
          <a
            className="underline"
            href="https://docs.corti.ai/stt/best-practices-transcribe"
            target="_blank"
            rel="noopener noreferrer"
          >
            transcript handling best-practices guide
          </a>
          : no space before left-attaching punctuation (<code>, . : ; ! ? ) ] &#125; %</code>); no
          space after opening brackets/quotes; French locale uses non-breaking space before{" "}
          <code>: ; ! ?</code>. Capitalizes the first letter at sentence boundaries (after{" "}
          <code>. ! ? …</code>) and at the start of a new line. Newlines in segment text (
          <code>\n</code> → line break, <code>\n\n</code> → paragraph break) render as{" "}
          <code>&lt;br&gt;</code> elements.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Layout-shift prevention
        </p>
        <p className="mt-1 text-muted-foreground">
          Each word span has constant <code>px-0.5</code> padding at all times. Bold text (
          <code>font-semibold</code>) is wider than normal (<code>font-normal</code>), but the
          padding absorbs the difference — the span's outer box width doesn't change when the active
          class toggles, so neighboring words never shift. The highlight uses an outset box-shadow
          instead of a border or inset ring.
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
          Live streaming mode
        </p>
        <p className="mt-1 text-muted-foreground">
          The applet can also capture live dictation via the <code>&lt;corti-dictation&gt;</code>{" "}
          web component connected to the <code>/transcribe</code> WebSocket endpoint. The same{" "}
          <code>wordLevel</code>, <code>diarize</code>, <code>automaticPunctuation</code>,{" "}
          <code>spokenPunctuation</code>, and <code>formatting</code> parameters are passed in the{" "}
          <code>TranscribeConfig</code>. A configuration wrench dialog provides commands,
          replacements, and dictionary terms — the same shared stores used by other dictation
          applets.
        </p>
        <p className="mt-1 text-muted-foreground">
          Since the web component owns its microphone internally and exposes no raw audio stream, a
          parallel <code>MediaRecorder</code> capture on the same device produces the audio blob for
          post-recording playback. The component's <code>recording-state-changed</code> events gate
          the capture, so it starts and stops in sync with the dictation session.
        </p>
        <p className="mt-1 text-muted-foreground">
          Live <code>/transcribe</code> timestamps arrive in <strong>seconds</strong> (float). The{" "}
          <code>useLiveTranscript</code> hook converts them to milliseconds on intake so the{" "}
          <code>SyncedTranscriptPlayer</code> and <code>usePlaybackSync</code> hook work unchanged
          across both modes.
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
