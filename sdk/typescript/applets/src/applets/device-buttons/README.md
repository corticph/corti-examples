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

## Activation model

Mappings are **global** — held in a single shared device store and applied across
every dictation and ambient applet — but they only take effect on a surface once
the handheld device is selected as that surface's **microphone**. Selecting a
built-in mic leaves the buttons inert; selecting the SpeechMike activates them
(and surfaces default to a connected handheld mic automatically). This keeps the
buttons tied to the device you are actually recording with, mirroring how the
keyboard push-to-talk / toggle keys drive the same start/stop/toggle methods.

Recording effects route to the active surface (`<corti-dictation>` /
`<corti-ambient>`, both expose `startRecording`/`stopRecording`/
`toggleRecording`). Command effects route to a consumer registered via
`useHidCommandHandler` — today the **dictation-commands** applet, which
dispatches the command id locally against its editor. The Corti API does not yet
execute button-triggered commands, so command mappings are client-side only.

## Browser support

WebHID is **Chromium-only** (Chrome / Edge) over a secure context (localhost is
fine); the applet hides its controls elsewhere. `requestDevice()` must run from a
user gesture (the Connect button), and granted devices reconnect automatically
on reload.

## Key files

- `DeviceButtons.tsx` — the mapping manager UI (connect, learn, per-button
  action / command selectors, live monitor).
- `DeviceButtonsDetails.tsx` — the "how it works" details card.
- `../_shared/hid-recording.ts` — pure button catalog + edge-detection
  (`computeButtonEffects`, `pressedButtonBit`); unit-tested, no WebHID needed.
- `../_shared/dictation-device.ts` — module-level singleton over
  `DictationDeviceManager`: device I/O, mappings, learn mode, and effect routing.
- `../_shared/useDictationDevice.ts` — React views: `useDictationDevice()`,
  `useHidRecordingControl(ref)` (wired into the dictation/ambient wrappers), and
  `useHidCommandHandler(fn)`.

## Dependencies to copy

- npm: `dictation_support` (plus `@corti/dictation-web` / `@corti/ambient-web` +
  `@lit/react` for the recording surfaces the buttons drive)
- shared files: `../_shared/hid-recording.ts`, `../_shared/dictation-device.ts`,
  `../_shared/useDictationDevice.ts`, `../_shared/config-store.ts`,
  `../_shared/useCortiAccessToken.ts`, and the
  `../_shared/corti-dictation-react.tsx` / `../_shared/corti-ambient-react.tsx`
  wrappers (which call `useHidRecordingControl`)
- local files: `DeviceButtons.tsx`, `DeviceButtonsDetails.tsx`
- to list command ids for command mappings: `../dictation-commands/command-store`
  (optional — replace with your own command source)

## Persistence

Button mappings persist per **API client** (`clientId:tenant`) via
`../_shared/config-store.ts` (localStorage today; swap for a server store when
hosted).
