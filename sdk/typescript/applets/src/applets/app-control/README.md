# Applet: App command-and-control

**Concept:** speech-control the *application*, not just text. Voice commands switch
tabs, open/close a panel, click buttons, and confirm/cancel a dialog — the
command-and-control half of a Fluency-Direct-style integration, plus the
**application awareness** (what's on screen / actionable now) that a real
integration needs.

A mock "clinical workspace" (tabs, a collapsible details panel, action buttons, a
confirm dialog) registers each actionable piece as an `AppControl`. The command
handler resolves a spoken target through the shared `AppControlRegistry` and runs
it, gated by `isAvailable()`. A live **app-awareness** panel is rendered straight
from the registry snapshot. Dictation still works (Notes tab) through the same
`EditorAdapter` as the other applets — both halves on one mic.

## How it differs from "Dictation box"

The dictation-box applet routes *text* (insert / transfer / focus a field). This
applet drives *app actions* (navigate / toggle / click / confirm). It reuses the
Phase-5 foundation (`useActiveControl`/`EditorAdapter`, the dispatch pattern, the
keybinding wrapper) and generalizes the dictation-box's applet-local dropdown into
a reusable `AppControlAdapter`.

## Commands

- **`go to {tab}`** / `switch to {tab}` — overview, orders, notes.
- **`open {panel}`** / `close {panel}` — the details side panel.
- **`create new order`** / **`save note`** — action buttons (verb-led full phrases
  recognize more reliably than a generic `click {button}` enum slot).
- **`confirm` / `cancel`** — only while the dialog is open (availability-gated).

## Native bridge

`_shared/native-host-adapter.ts` documents (does not implement) the
`NativeHostAdapter` seam: the same resolve-and-run contract over an IPC bridge to a
desktop/OS host, so the integration logic runs against web or native UI unchanged.

## Key files

- `AppControl.tsx` — applet: registry, mic, command routing, awareness panel + log.
- `MockApp.tsx` — the mock app UI; registers its controls into the registry.
- `commands.ts` — `APP_COMMANDS` config + `handleAppCommand` dispatch.
- `config.ts` — `buildDictationConfig`.
- `../_shared/app-control-adapter.ts` — the reusable `AppControlRegistry`.
- `../_shared/native-host-adapter.ts` — the native bridge design seam.

## Dependencies to copy

- npm: `@corti/sdk`, `@corti/dictation-web`, `@lit/react`
- shared files: `../_shared/corti-dictation-react.tsx`,
  `../_shared/app-control-adapter.ts`, `../_shared/native-host-adapter.ts`,
  `../_shared/editor-adapter.ts`, `../_shared/text-insertion.ts`,
  `../_shared/useActiveControl.ts`, `../_shared/useCortiAccessToken.ts`
- local files: `AppControl.tsx`, `MockApp.tsx`, `commands.ts`, `config.ts`
