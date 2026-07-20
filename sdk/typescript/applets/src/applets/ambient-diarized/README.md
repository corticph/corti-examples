# Applet: Diarized ambient

**Concept:** render a `/streams` diarized transcript in true chronological order,
grouped by speaker.

`/streams` `transcript` messages carry an **array** of finalized segments that
can arrive out of order across speakers (no interim results). This applet merges
them with `mergeDiarizedSegments` (ordered by `time.start`, tie-break
`time.end`) and renders speaker runs with `groupBySpeakerRuns` from
`../_shared/diarizedTranscript.ts` — never appending in arrival order.

It also toggles:

- **diarization** (separate speakers within one mono stream), vs
- **multichannel** (fixed doctor/patient channel roles), and
- **facts mode** (extracted facts grouped by category) vs transcription.

An interaction id is created on mount via the host `createInteraction()` and
passed to `<corti-ambient>`.

## Dependencies to copy

- npm: `@corti/sdk`, `@corti/ambient-web`, `@lit/react`
- shared files: `../_shared/cortiAmbientReact.tsx`,
  `../_shared/diarizedTranscript.ts`, `../_shared/useCortiAccessToken.ts`
- local files: `config.ts`
- host integration: an interaction id (`POST /interactions`) — here via
  `useAuth().createInteraction()`.
