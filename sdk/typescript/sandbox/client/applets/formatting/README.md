# Applet: Formatting playground

**Concept:** configure how dates, times, numbers, measurements, and ordinals
appear in the transcript, and compare formatting options side-by-side with
parallel WebSocket connections.

Two modes:

1. **Single dictation** — dictate into a rich text editor with a reusable
   formatting settings dialog. Change preferences and dictate again to see the
   difference.
2. **Comparison** — pick a formatting category (e.g., dates), open one parallel
   `/transcribe` WebSocket per formatting option, stream one microphone to all
   connections, and view results side-by-side.

## How formatting config works

The `formatting` object in the `/transcribe` configuration has six optional
fields (`dates`, `times`, `numbers`, `measurements`, `numericRanges`,
`ordinals`). When a field is omitted, the server applies its default value.
This applet only sends fields that differ from the server default — see
`stripDefaultFormatting()` in `formattingOptions.ts`.

Formatting is a config-time setting: it is sent in the initial `config` message
and cannot be changed mid-session. The single-dictation mode shows a
"Restart recording to apply changes" hint when the draft config differs from
the active session.

## Comparison mode

Uses `@corti/sdk` directly (not the web component) to open multiple
`client.transcribe.connect()` calls concurrently, each with a different
formatting value for the selected category. One `getUserMedia` stream feeds
audio to all sockets via a single `MediaRecorder` — each `dataavailable` chunk
is fanned out to every open socket.

- **Record** opens N sockets and starts the mic. If sockets are already open
  (paused), it resumes into them.
- **Stop** sends a `flush` to force pending transcripts, stops the mic, marks
  connections as paused. Sockets stay open; results remain visible.
- **Clear** closes all sockets and wipes everything.

Socket state updates are coalesced via `requestAnimationFrame` so the high
message rate from parallel connections does not flood React's render queue.

## Reusable components

- `FormattingFields` (in `FormattingDialog.tsx`) — inline 6-row settings UI
  (label + description on the left, Select dropdown on the right). Used directly
  in the dictation suite's formatting panel.
- `FormattingDialog` — wraps `FormattingFields` in a Radix Dialog. Used in
  this applet's single-dictation mode.
- `formattingOptions.ts` — canonical metadata for all 6 formatting categories
  (currently supported values only). Importable by any applet.
- `formattingStore.ts` — `useFormattingConfig()` hook with `useSyncExternalStore`
  + localStorage persistence. Shared across all applets that import it.

## Dependencies to copy

- npm: `@corti/sdk`, `@corti/dictation-web`, `@lit/react`
- shared files: `../_shared/cortiDictationReact.tsx`,
  `../_shared/editorAdapter.ts`, `../_shared/textInsertion.ts`,
  `../_shared/useActiveControl.ts`, `../_shared/useCortiAccessToken.ts`,
  `../_shared/useDictationLanguage.ts`
- local files: `config.ts`, `formattingOptions.ts`, `formattingStore.ts`,
  `FormattingDialog.tsx`, `comparisonConnection.ts`, `ComparisonSection.tsx`

## Notes

- Locale-based options (dates, times) format according to the `primaryLanguage`
  in the config. `en` defaults to 12-hour time and "February 3, 2025"; `en-GB`
  defaults to 24-hour time and "3 February 2025".
- The comparison mode opens one WebSocket per formatting option in the selected
  category. For dates that is 5 connections; for measurements only 2. Each
  connection consumes credits independently.
- The SDK's `TranscribeConfig` types `formatting` as `Corti.TranscribeFormatting`
  (string-union enums), but this applet uses the plain-string `FormattingConfig`
  type and casts via `as unknown as Corti.TranscribeConfig` — the same pattern
  the dictation suite uses for `replacements` and `keyterms`.
