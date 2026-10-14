# Applet: Playback highlighting

**Concept:** word-level transcript synced to audio playback with real-time
highlighting (a "karaoke" view for transcript verification), plus command
detection and sequencing visualization.

Two modes, toggled from the top of the applet:

- **File processing** — upload an audio file, run the REST `/transcripts`
  pipeline with `wordLevel: { enabled: true }`, then play back the audio
  while the transcript highlights each word as it's spoken.
- **Live streaming** — dictate into the microphone via the
  `<corti-dictation>` web component. Multiple recordings accumulate
  additively; stop to replay the combined audio with synced highlighting.
  Voice commands are detected, timestamped, and displayed alongside the
  transcript with playback-synced highlighting.

Both modes share the same `SyncedTranscriptPlayer` — the only difference is
the segment source (REST pipeline vs live WebSocket) and the audio source
(uploaded file vs parallel MediaRecorder capture).

## File processing flow

1. Upload an audio file and pick a primary language.
2. Toggle config options:
   - `wordLevel` (default on) — per-word timestamps for highlighting
   - `spokenPunctuation` (default on)
   - `automaticPunctuation` (default off)
   - `diarize` (default off) — separate speakers with color-coded badges
   - Formatting preferences (collapsible; omitted from request when all at
     server defaults)
3. Click **Run pipeline** — the applet creates an interaction, uploads the
   recording, creates an async transcript, polls to completion, and fetches
   the finalized result.
4. Play back the audio with the synced transcript player:
   - The active word gets a highlight background + bold text
   - Click any word to seek the audio to that word's start time
   - Hover any word for its timestamp range
   - Speed control (0.5×–2×), custom scrubber
   - Speaker badges at speaker boundaries (when diarized)
   - View raw JSON and download the transcript response

## Live streaming flow

1. Toggle to **Live streaming** mode.
2. Toggle config options (same toggles as file mode — `wordLevel`, `diarize`,
   `automaticPunctuation`, `spokenPunctuation`).
3. Use the dictation web component's built-in device picker, language
   selector, and keybinding settings. Use the configuration wrench dialog
   for commands, replacements, and dictionary terms.
4. Dictate using push-to-talk or toggle-to-talk. Interim text appears as
   ghost text while speaking; final segments accumulate in the background.
5. Stop recording — the applet replays the captured audio with synced
   highlighting using the same `SyncedTranscriptPlayer` as file mode.
6. Start another recording — segments, commands, and audio accumulate
   additively across recordings. Click **Clear all** to reset.

## Command detection and sequencing

Live mode supports voice commands configured via the wrench dialog. When
the server recognizes a command phrase, it sends a `command` message with
timestamps. The applet:

- Tracks commands with their `id`, `variables`, `rawTranscriptText`, and
  `start`/`end` timestamps (converted from seconds to ms).
- Renders a "Detected commands" list below the transcript area — each row
  shows the command id, variables, raw text, and timestamp range.
- Highlights the active command during playback when `currentTime` falls
  within its `[startMs, endMs]` range.
- Click any command row to seek audio to the command's start.

A sequencing timeline strip between the control bar and the transcript area
shows the interleaved order of text (lime) and command (amber) events,
proportionally positioned on the full audio timeline. Click any bar to seek.

## Multi-recording audio concatenation

Live mode concatenates all recordings into a single audio source. WebM blob
concatenation via `new Blob([...blobs])` produces unreliable `currentTime`
and `Infinity` duration — the Matroska container's cluster timestamps don't
span across blobs. Instead, each WebM blob is decoded to PCM via
`AudioContext.decodeAudioData`, concatenated sample-by-sample, and re-encoded
as WAV, which has an accurate, continuous timeline.

Server timestamps are session-relative (they keep climbing through idle gaps
between recordings). The concatenated audio has no gaps, so `useLiveTranscript`
subtracts the idle gap from each subsequent recording's timestamps to keep
them aligned with the combined audio timeline.

## Corti SDK

The applet uses the `@corti/sdk` `CortiClient` for all REST calls —
`interactions.create`, `recordings.upload`, `transcripts.create`,
`transcripts.getStatus`, and `transcripts.get`. The transcript create
request accepts `wordLevel`, `async`, `automaticPunctuation`,
`spokenPunctuation`, and `formatting` alongside the standard
`recordingId`, `primaryLanguage`, and `diarize` fields. The client is
instantiated with an environment and auth config from
`useCortiAccessToken`.

## Text presentation

Follows the spacing and casing rules from the
[transcript handling best-practices guide](https://docs.corti.ai/stt/best-practices-transcribe):

- **Spacing**: no space before left-attaching punctuation (`, . : ; ! ? ) ] } %`);
  no space after opening brackets/quotes; French locale uses non-breaking space
  before `:`, `;`, `!`, `?`.
- **Casing**: capitalizes the first letter at sentence boundaries (after `.`,
  `!`, `?`, `…`) and at the start of a new line/paragraph.
- **Line breaks**: `\n` in segment text renders as a line break; `\n\n` as a
  paragraph break.

## Layout-shift prevention

Each word span has constant horizontal padding (`px-0.5`) at all times. Bold
text is wider than normal text, but the padding absorbs the difference — the
span's outer box width doesn't change when the active class toggles, so
neighboring words never shift. The interim preview area is always visible
with a persistent border and placeholder text.

## Sync approach

`requestAnimationFrame` (not `timeupdate`) drives the highlight at ~60fps. A
binary search finds the last segment whose `start` <= current audio time —
O(log n) per frame, smooth even for long transcripts with thousands of word
entries. See [`usePlaybackSync.ts`](./usePlaybackSync.ts) for the hook and
[`SyncedTranscriptPlayer.tsx`](./SyncedTranscriptPlayer.tsx) for the player.

## Key files

- `PlaybackHighlighting.tsx` — main component: mode toggle, shared config
  toggles, file processing UI, live streaming UI
- `pipeline.ts` — SDK pipeline (create interaction → upload recording →
  create transcript → poll → fetch) with `wordLevel` support
- `SyncedTranscriptPlayer.tsx` — audio player bar + scrollable transcript
  with synced highlighting, click-to-seek, hover timestamps, sequencing
  timeline strip, command list with playback-synced highlighting, JSON
  view/download
- `usePlaybackSync.ts` — `requestAnimationFrame` hook with binary-search
  active word tracking
- `LiveDictationPanel.tsx` — live streaming panel: dictation component,
  parallel audio capture, WAV concatenation, archive clearing, transcript
  and command wiring, player rendering
- `LiveDictationConfig.tsx` — configuration wrench dialog (commands,
  replacements, dictionary)
- `useLiveTranscript.ts` — hook for accumulating live `/transcribe` segments
  and commands (seconds → ms conversion, gap-offset for multi-recording
  timestamp alignment, interim tracking, recording state)
- `concatAudio.ts` — decodes WebM blobs to PCM via `AudioContext`,
  concatenates, re-encodes as WAV for accurate `currentTime`/`duration`
- `PlaybackHighlightingDetails.tsx` — details card for the docs page

## Shared dependencies

- `../_shared/useCortiAccessToken.ts` — SDK environment and auth config
- `../_shared/useDictationLanguage.ts` — global dictation language store
- `../_shared/cortiDictationReact.tsx` — React wrapper for
  `<corti-dictation>`
- `../_shared/formatting.ts` — `buildFormattingOverrides`, `DEFAULT_FORMATTING`
- `../_shared/types.ts` — `FormattingConfig`
- `../_shared/sessionState.tsx` — `useSessionState` for cross-navigation
  persistence
- `../_shared/RuleManager.tsx` — generic rule list (replacements, terms)
- `../_shared/useAudioArchive.ts` — audio archive store (blob, playback URL)
- `../dictation-suite/useParallelArchive.ts` — parallel MediaRecorder capture
- `../dictation-commands/CommandManager.tsx` — voice command management
- `../text-replacements/replacements.ts` — replacement store
- `../dictionary-terms/terms.ts` — dictionary term store
- `../../components/ui/*` — shadcn/ui primitives (Button, Select, Switch,
  Dialog, ScrollArea)
