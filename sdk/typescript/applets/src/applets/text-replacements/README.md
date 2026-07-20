# Applet: Text replacements

**Concept:** manage find/replace rules that rewrite spoken phrases in the final
transcript (Corti `replacements`), e.g. "BID" → "twice daily".

Configure the rule set in the manager (preloaded from
`corti-examples/dictation/replacements`), then dictate to see them applied. Same
management UX as the commands applet: multiselect to **export** a JSON config
(`corti-replacements.json`, in the corti-examples shape) or **remove** (with
confirmation; built-in catalog entries are protected). Rules persist per **API
client** (`clientId:tenant`).

## Gating

`replacements` is in the `/transcribe` asyncapi spec but not yet typed by
`@corti/dictation-web@0.7.0`, so it's sent via a typed cast (`buildReplacementConfig`).
Drop the cast once the SDK includes it; until then the server applying it depends
on SDK/cluster support.

## Key files

- `replacements.ts` — `Replacement` type, catalog, store, `toExport`,
  `buildReplacementConfig`.
- `TextReplacements.tsx` — dictation surface (shared `DictationField`).
- `ReplacementsDetails.tsx` — manager (shared `RuleManager`).

## Dependencies to copy

- npm: `@corti/sdk`, `@corti/dictation-web`, `@lit/react`
- shared files: `../_shared/DictationField.tsx`, `../_shared/RuleManager.tsx`,
  `../_shared/ruleStore.ts`, `../_shared/configStore.ts`,
  `../_shared/cortiDictationReact.tsx`, `../_shared/editorAdapter.ts`,
  `../_shared/textInsertion.ts`, `../_shared/useActiveControl.ts`,
  `../_shared/useCortiAccessToken.ts`
- local files: `replacements.ts`
