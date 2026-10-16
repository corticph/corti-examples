# Applet: Dictionary terms

**Concept:** manage custom vocabulary ("terms") that bias recognition toward
domain words — drug names, acronyms, etc. (Corti `terms`,
`/api-reference/transcribe#param-terms`).

Configure the term list in the manager, then dictate. Same management UX as the
other config applets: multiselect to **export** (`corti-terms.json`) or **remove**
(with confirmation; built-in entries protected). Terms persist per **API client**
(`clientId:tenant`).

## Gating

The applet now mirrors the current Transcribe tab payload shape: a normalized
`terms` array plus the matching `keyterms` wrapper used by the compatibility
path in the tester UI. There's no published examples catalog yet, so the
preloaded set is a small medical starter list.

## Key files

- `terms.ts` — `Term` type, catalog, store, `toExport`, `buildTermsConfig`.
- `DictionaryTerms.tsx` — dictation surface (shared `DictationField`).
- `TermsDetails.tsx` — manager (shared `RuleManager`).

## Dependencies to copy

Same shared set as the text-replacements applet, plus local `terms.ts`.
