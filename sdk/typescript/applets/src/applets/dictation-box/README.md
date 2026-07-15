# Applet: Dictation box

**Concept:** the signature Fluency-Direct workflow — speech-enable a real app UI.
Dictate into whichever field is focused, route dictation to a scratch **dictation
box**, **transfer** the box into a form field, and **navigate the form by voice**.

A single `<corti-dictation>` mic drives a mock form (left) and a scratch
box (right). Final dictation inserts at the caret of the focused control — like
typing — through the framework-agnostic `EditorAdapter`. Commands change the
routing and drive the form:

- **`show dictation box`** — focus the box (caret to end, or left in place if it
  was already focused).
- **`target dictation box`** — route dictation into the box *without* moving
  focus. The form field keeps its caret + lime border; the box shows a "Receiving
  dictation" badge. The override clears when you focus another field (click or
  `go to {field}`) or on transfer.
- **`transfer text`** — insert the box's text at the caret of the last-active form
  field, then clear the box.
- **`go to {field}`** — focus a text field (caret to end) or open a dropdown.
- **`pick|choose|option {number}`** — select the Nth option in the open dropdown.

## Notes

- **Targeting model:** `useActiveControl` tracks the focused editable for normal
  insertion; a separate `focusin` listener records the last-active **non-box**
  editable as the transfer destination. The box-target override is the only case
  where the insertion target differs from the focused control.
- **Custom dropdown:** native `<select>` can't be opened or picked-by-index
  programmatically, so dropdown fields are a button + listbox (`Dropdown.tsx`)
  with an imperative handle. Field control stays applet-local for now;
  generalizing it into an `AppControlAdapter` is the next phase.

## Key files

- `DictationBox.tsx` — the applet: layout, targeting/override logic, transcript +
  command handlers.
- `MockForm.tsx` — the mock form; publishes a `FieldHandle` per field.
- `Dropdown.tsx` — custom listbox with an imperative `open`/`pick` handle.
- `commands.ts` — `BOX_COMMANDS` config + `handleBoxCommand` dispatch + `BoxActions`.
- `config.ts` — `buildDictationConfig`.

## Dependencies to copy

- npm: `@corti/sdk`, `@corti/dictation-web`, `@lit/react`
- shared files: `../_shared/corti-dictation-react.tsx`,
  `../_shared/editor-adapter.ts`, `../_shared/text-insertion.ts`,
  `../_shared/useActiveControl.ts`, `../_shared/useCortiAccessToken.ts`
- local files: `DictationBox.tsx`, `MockForm.tsx`, `Dropdown.tsx`, `commands.ts`,
  `config.ts`

## Auth

`useCortiAccessToken()` adapts this app's auth into the `{ refreshAccessToken }`
the web component needs. Replace it with any token source returning `{
accessToken, expiresIn? }` — the SDK derives cluster + tenant from the JWT.
