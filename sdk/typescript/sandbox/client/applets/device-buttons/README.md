# Applet: Device buttons

**Concept:** map the buttons on a handheld dictation mic to recording and
commands, over **WebHID** — no native driver or browser extension.

Connect a Philips SpeechMike / SpeechOne / PowerMic / Foot Control via the
[`dictation_support`](https://www.npmjs.com/package/dictation_support) library,
which decodes each device's HID reports into semantic button events (Record,
Stop, Play, F1–F4, EOL/Prio…). Each button is mapped to one action:

- **Toggle-to-talk** — press flips recording on/off.
- **Push-to-talk** — hold to record, release to stop.
- **Run command** — fire a configured dictation command by id (local-only; see
  below).

Buttons are **learned by pressing them** ("Add mapping" captures the next press
by name), so only the buttons a device actually has appear. Record → toggle is
mapped out of the box.

## Two-layer mapping model

Mappings have two layers:

- **Global** — the source of truth, edited in the standalone Device Buttons
  applet. These are the defaults that apply in every applet. Persisted per API
  client (`clientId:tenant`).
- **Per-applet overrides** — when DeviceButtons is embedded in an applet (e.g.
  dictation-suite's device panel), edits create an override for that applet.
  The override shadows the global mapping for the same button while that applet
  is active; buttons without overrides fall back to global. Overrides persist
  per API client per applet.

The UI shows a "global" or "override" badge on each button row. An overridden
button has a "reset to global" action that clears the override.

## Activation model

Mappings take effect on a surface once the handheld device is selected as that
surface's **microphone**. Selecting a built-in mic leaves the buttons inert;
selecting the SpeechMike activates them (and surfaces default to a connected
handheld mic automatically). This keeps the buttons tied to the device you are
actually recording with, mirroring how the keyboard push-to-talk / toggle keys
drive the same start/stop/toggle methods.

Recording effects route to the active surface (`<corti-dictation>` /
`<corti-ambient>`, both expose `startRecording`/`stopRecording`/
`toggleRecording`). Command effects route to a consumer registered via
`useHidCommandHandler` — each applet that can dispatch commands registers both
a handler (for the button press) and a command catalog (for the mapping
dropdown). The Corti API does not yet execute button-triggered commands, so
command mappings are client-side only.

## Command catalogs and availability

Each applet registers the command ids it can run via `useHidCommandCatalog`.
The DeviceButtons dropdown reads this catalog — it shows the active applet's
commands as selectable, and commands from other applets (or `commandStore`) as
greyed out with "(unavailable in this app)". At runtime, pressing a button
mapped to an unavailable command surfaces a store error (visible in the device
panel and `console.warn`) instead of silently dropping.

Applets with no command concept (e.g. dictation-richtext) register an empty
catalog via `useHidNoCommands`. Command-mapped buttons show greyed out in their
device panels and produce a runtime error if pressed. Recording buttons work
normally.

## Browser support

WebHID is **Chromium-only** (Chrome / Edge) over a secure context (localhost is
fine); the applet hides its controls elsewhere. `requestDevice()` must run from a
user gesture (the Connect button), and granted devices reconnect automatically
on reload.

## Key files

- `DeviceButtons.tsx` — the mapping manager UI (connect, learn, per-button
  action / command selectors, global/override badges, live monitor).
- `DeviceButtonsDetails.tsx` — the "how it works" details card.
- `mappingStore.ts` — persistence bridge for global mappings and per-applet
  overrides (localStorage per API client).
- `../_shared/hidRecording.ts` — pure button catalog + edge-detection
  (`computeButtonEffects`, `pressedButtonBit`); unit-tested, no WebHID needed.
- `../_shared/dictationDevice.ts` — module-level singleton over
  `DictationDeviceManager`: device I/O, two-layer mappings, command catalogs,
  learn mode, and effect routing.
- `../_shared/useDictationDevice.ts` — React views: `useDictationDevice()`,
  `useHidRecordingControl(ref)` (wired into the dictation/ambient wrappers),
  `useHidCommandHandler(fn)`, `useHidCommandCatalog(appletId, commands)`, and
  `useHidNoCommands(appletId)`.

## Dependencies to copy

- npm: `dictation_support` (plus `@corti/dictation-web` / `@corti/ambient-web` +
  `@lit/react` for the recording surfaces the buttons drive)
- shared files: `../_shared/hid-recording.ts`, `../_shared/dictation-device.ts`,
  `../_shared/useDictationDevice.ts`, `../_shared/config-store.ts`,
  `../_shared/useCortiAccessToken.ts`, and the
  `../_shared/corti-dictation-react.tsx` / `../_shared/corti-ambient-react.tsx`
  wrappers (which call `useHidRecordingControl`)
- local files: `DeviceButtons.tsx`, `DeviceButtonsDetails.tsx`, `mappingStore.ts`

## Persistence

Button mappings persist per **API client** (`clientId:tenant`) via
`../_shared/config-store.ts` (localStorage today; swap for a server store when
hosted). Global mappings are stored under `buttonMappings`; per-applet
overrides under `buttonMappings:overrides:${appletId}`.

## Known limitations

- Runtime command-availability errors surface in the DeviceButtons panel and
  `console.warn`. Toast notifications or an app-wide command debugger would make
  these more visible without the device panel open — a future improvement.
- The standalone Device Buttons applet shows only the `commandStore` catalog
  (from dictation-commands). A "show all catalogs" view that lists every
  applet's commands is a planned enhancement (Phase 7 in the PRD).
