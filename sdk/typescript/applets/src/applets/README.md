# Sandbox applets

Each applet is a **self-contained example implementation of one concept** using
the Corti SDK (`@corti/sdk`) and/or the dictation/ambient web components
(`@corti/dictation-web`, `@corti/ambient-web`), wrapped for React with
`@lit/react`.

| Applet | Concept |
| --- | --- |
| `dictation-commands` | Executable voice commands → real editor actions |
| `dictation-richtext` | Casing/spacing insertion into formatted content |
| `dictation-audio-archive` | Capture dictation microphone audio + store locally |
| `ambient-diarized` | Time-ordered, speaker-grouped `/streams` transcript |
| `dictation-sdk` | Raw `@corti/sdk` with host-managed microphone |

## Shared foundation (`_shared/`)

The reusable STT-integration layer — editor-agnostic, the actual deliverable for
customers building their own apps/hardware:

- `editorAdapter.ts` — `EditorAdapter` over a `<textarea>` / contenteditable
  (DOM-backed, framework-agnostic; the seam a native integration would reimplement).
- `commandDispatch.ts` — maps `command` events (enum **or** wildcard variables)
  to real editor actions via the adapter.
- `offsetMap.ts` — keeps tracked text ranges valid across dictation, commands,
  and manual typing.
- `textInsertion.ts` — casing/spacing boundary rules.
- `diarizedTranscript.ts` — time-ordering for `/streams`.
- `audioArchive.ts` / `audioArchiveStore.ts` / `useAudioArchive.ts` — local
  audio-archive seam (types, IndexedDB store, active-session hook).
- `useActiveControl.ts` — tracks the focused editable control as an adapter.
- `cortiDictationReact.tsx` / `cortiAmbientReact.tsx` — `@lit/react` wrappers.
- `useCortiAccessToken.ts` — host-auth adapter (swap for your own token source).

## Portability

Applet components depend only on (a) the npm packages, (b) an injected token via
`_shared/useCortiAccessToken.ts`, and (c) the documented `_shared` helpers. Each
applet's `README.md` lists exactly what to copy to lift it into a standalone
example. Shared logic lives once in `_shared/` to avoid drift.

The SDK and web components derive `environment` (cluster) and `tenantName` by
decoding the JWT `iss` (`https://auth.<cluster>.corti.app/realms/<tenant>`), so
they work against any cluster — including non-prod — with only a token.

Adding an applet: create a folder + add one entry to `registry.ts`.
