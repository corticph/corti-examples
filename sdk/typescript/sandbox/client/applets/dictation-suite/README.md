# Dictation suite

**Concept:** every dictation feature on one editor, one microphone, one config.

The other dictation applets each demonstrate one concept in isolation. Each
builds its own `TranscribeConfig`, so they can't run together — you can have
replacements OR voice commands OR the cleanup agent, never all three — and each
keeps its text in component-local state that navigating away discards. This
applet is what it looks like when they're composed.

## What it composes

| Feature                     | Comes from                                                         |
| --------------------------- | ------------------------------------------------------------------ |
| Replacement rules           | `text-replacements/replacements.ts`                                |
| Dictionary terms / keyterms | `dictionary-terms/terms.ts`                                        |
| Voice commands              | `dictation-commands/commandModel.ts`, `_shared/commandDispatch.ts` |
| Cleanup agent + prompts     | `on-demand-agent/agent.ts`, `on-demand-agent/prompts.ts`           |
| Handheld microphone buttons | `device-buttons/`, `_shared/useDictationDevice.ts`                 |
| Audio archive               | `_shared/useAudioArchive.ts`                                       |

Nothing here reimplements those — the panels embed the same components and read
the same stores. Only the pieces below are specific to this applet.

## Key files

- `suiteConfig.ts` — the single merged `TranscribeConfig`. All three extras are
  declared server-side in the config rather than applied client-side after the
  fact: `replacements` rewrite phrases in the final transcript, `terms` /
  `keyterms` bias recognition, and `commands` make the server emit a `command`
  event on a phrase match.
- `suiteControls.ts` — the suite's own voice commands (run cleanup, open a panel,
  focus the editor). Clearing the draft is deliberately **not** voice-triggerable:
  a misrecognition there destroys dictated text, so it stays a button.
- `draftStore.ts` — mirrors the editor to localStorage, namespaced per API
  client, so text survives navigation, reload and closing the tab.
- `editorHistory.ts` — app-level undo/redo. Native Cmd+Z can't see the
  programmatic writes (see below).
- `useParallelArchive.ts` — archives audio as an independent capture of the same
  input device, gated on the component's `recording-state-changed` events.
- `SuitePanels.tsx` — the panel sidebar.

## Why button commands need their own registration

Recording buttons on a handheld mic work in any applet for free — the
`<corti-dictation>` wrapper registers the recording surface itself. Command-mapped
buttons do **not**: the shared device store routes them to whichever applet
registered a consumer via `useHidCommandHandler`, and surfaces an error when
none has. So this applet registers a handler that feeds `runCommandData`, the
same function the component's `command` event feeds, and a command catalog via
`useHidCommandCatalog` that publishes the suite's runnable command ids (the
`commandStore` catalog + `copy_edit` + the suite's own `show_panel` and
`focus_editor` commands). Both routes share the undo checkpoint, the app-level
commands in `suiteControls.ts` and the debugger log; a button press is just a
command with no variables.

## Why undo and draft persistence are hand-rolled

The editor is deliberately uncontrolled, and every programmatic writer —
dictation insertion, voice-command actions, the cleanup agent — mutates the DOM
imperatively through `Range.deleteContents()` / `insertNode()`. That has two
consequences:

- **No `input` event fires**, so persistence observes mutations instead. A
  `MutationObserver` is the only subscription that catches every writer with one
  registration, typing included.
- **Raw DOM mutation does not enter the browser's undo stack** — only real user
  input and `execCommand` do. So native Cmd+Z could undo typing but silently did
  nothing for a dictated segment, a voice command, or a cleanup rewrite, which
  are the three ways this editor actually loses text. Routing writes through
  `execCommand` would restore native undo, but `execCommand` acts on the real
  document selection, forcing the adapter to focus the editor and move the caret
  on every write — undoing the deliberate no-focus-steal behaviour in
  `insertTextAtSelection`.

## Why the archive is a second recorder

`<corti-dictation>` owns its microphone internally and exposes no raw audio — its
`audio-event` payload is a Corti `AudioEventMessage` (server-side voice activity),
not audio data, and the element surfaces no `MediaStream` or `MediaRecorder`. The
standalone audio-archive applet only works because it bypasses the web component
and drives `client.transcribe.connect()` with its own `MediaRecorder`, which would
mean giving up the component's handheld microphone control, keybindings and pickers.

So archiving here is an independent capture of the same device. Consequences:
two concurrent captures of one microphone (browsers allow this), and segment
boundaries derived from the component's state events, so they track what was
transcribed to within an event-dispatch tick rather than being sample-exact. The
archived audio is what the microphone heard — which is the point — but it is not
byte-identical to the frames the component streamed.
