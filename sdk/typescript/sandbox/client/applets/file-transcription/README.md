# Applet: File transcription

**Concept:** a basic offline transcription workflow built on `/transcripts`.

Upload an audio file or reuse an existing interaction recording, then generate
an offline transcript through `/transcripts`. This applet showcases asynchronous
transcript generation and polling for the final result.

## Flow

1. Choose an audio source:
   - upload a new file
   - or pick an existing interaction recording
2. Set the core `/transcripts` parameters:
   - `primaryLanguage`
   - `isDictation`
   - `isMultichannel`
   - `diarize`
3. Click **Generate transcript**
4. The applet:
   - creates or selects the interaction
   - uploads the recording when needed
   - calls `POST /interactions/{id}/transcripts/` with `async: true`
   - polls `/status` until the transcript is complete
   - fetches the finalized transcript
   - shows the flattened text plus the raw JSON payload

## Transcript engine

The whole upload → create → poll → fetch pipeline, the input form, and the
result surfaces come from the shared transcript runner in
[`../_shared/transcript-runner`](../_shared/transcript-runner). This applet is a
thin composition of those pieces with no second-pass step — it calls
`runner.generate()` with no `secondPass`, so the runner finishes at the
finalized transcript.

## Key files

- `FileTranscription.tsx` — composes the shared runner hook + form + result
  cards
- `FileTranscriptionDetails.tsx` — details card
- `README.md` — behavior + composition notes
