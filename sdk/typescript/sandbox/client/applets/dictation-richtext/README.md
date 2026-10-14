# Applet: Rich-text insertion

**Concept:** insert dictated text into formatted (`contenteditable`) content with
correct spacing and sentence casing, at the caret.

Final segments from `<corti-dictation>` are inserted through the shared
`ContentEditableAdapter` (`../_shared/editor-adapter.ts`), which applies the same
`buildInsertion` casing/spacing rules and inserts a text node at the caret via
the `Range`/`Selection` API — so it inherits any bold/italic formatting active at
the cursor. Interim results are previewed below the editor rather than written
into the document.

The contenteditable here is a deliberately minimal stand-in; the reusable part is
the STT integration (the adapter + insertion rules), not the editor.

## Dependencies to copy

- npm: `@corti/sdk`, `@corti/dictation-web`, `@lit/react`
- shared files: `../_shared/corti-dictation-react.tsx`,
  `../_shared/editor-adapter.ts`, `../_shared/text-insertion.ts`,
  `../_shared/useActiveControl.ts`, `../_shared/useCortiAccessToken.ts`
- local files: `config.ts`

## Notes

Bold/italic use `document.execCommand`, which keeps the example dependency-free.
A production editor would likely use a framework (Tiptap/Lexical); the insertion
boundary logic in `text-insertion.ts` is editor-agnostic.
