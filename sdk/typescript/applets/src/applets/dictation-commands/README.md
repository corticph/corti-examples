# Applet: Dictation commands

**Concept:** turn Corti `command` events into _real_ editor actions, and manage
the command set from the UI.

Dictate into a plain `<textarea>` via `<corti-dictation>`. Commands are
**data-driven** (`ManagedCommand` = id + phrases + variables + a client-side
`action`) and routed through the shared dispatcher to real editor actions. The
manager card lets you view the preloaded catalog, create/edit your own commands,
and multiselect commands to **export** them as a shareable JSON config
(`corti-commands.json`) or **remove** them (with a confirmation dialog; built-in
catalog commands are protected). A monitor logs each detected command and the
action executed.

- **Actions:** `insert_text` (predefined text), `keypress` (a captured sequence
  of keystrokes — printable keys typed literally, combos like Ctrl/Cmd+B mapped
  to formatting), and `script` (author JS run with `editor`/`command`/`variables`
  in scope), plus built-ins (delete/select/format/template/
  paragraph) used by the catalog.
- **Variables:** `enum` (value list) or `wildcard` (open-ended). Wildcard is
  emitted via a typed shim until `@corti/sdk` ships `type: "wildcard"` (PR #202);
  the UI surfaces the recognition constraints.
- **Editor awareness:** the editor is driven through the framework-agnostic
  `EditorAdapter`; dictation-segment ranges stay valid across dictation,
  commands, and manual typing via `../_shared/offset-map.ts`.
- **Persistence:** user-created commands persist per **API client**
  (`clientId:tenant`) via `../_shared/config-store.ts` (localStorage today;
  swap for a server store when hosted).

## Key files

- `command-model.ts` — `ManagedCommand`, the preloaded `CATALOG`,
  `toTranscribeCommands`, `buildRegistry`.
- `command-store.ts` — identity-namespaced store (commands + monitor log).
- `CommandManager.tsx` / `CommandEditor.tsx` — the manager UI + create/edit form.
- `config.ts` — `buildDictationConfig`.

## Dependencies to copy

- npm: `@corti/sdk`, `@corti/dictation-web`, `@lit/react`
- shared files: `../_shared/corti-dictation-react.tsx`,
  `../_shared/editor-adapter.ts`, `../_shared/command-dispatch.ts`,
  `../_shared/offset-map.ts`, `../_shared/text-insertion.ts`,
  `../_shared/useActiveControl.ts`, `../_shared/config-store.ts`,
  `../_shared/useCortiAccessToken.ts`
- local files: `command-model.ts`, `command-store.ts`, `CommandManager.tsx`,
  `CommandEditor.tsx`, `config.ts`

## Auth

`useCortiAccessToken()` adapts this app's auth into the `{ refreshAccessToken }`
the web component needs (and exposes `clientId`/`tenantName` for config
namespacing). Replace it with any token source returning `{ accessToken,
expiresIn? }` — the SDK derives cluster + tenant from the JWT.
