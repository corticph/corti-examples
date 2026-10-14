# Applet: Languages

**Concept:** the `client.languages.list()` SDK method, which reports which
languages Corti speech to text supports and which endpoints
(`transcribe` / `streams` / `transcripts`) each is enabled for.

Pick an optional endpoint filter from the dropdown (default **All endpoints**),
click **Fetch languages**, and the SDK call runs against the live cluster.
Results render as a per-endpoint availability table (✓/✗ per endpoint) or as
the raw JSON body.

## SDK call

```
client.languages.list({ endpoint?: "transcribe" | "streams" | "transcripts" })
```

The `endpoint` parameter is passed only when a specific endpoint is chosen;
"All endpoints" omits it and returns the full map.

## Key files

- `languagesApi.ts` — response types, `fetchLanguages()` (wraps
  `client.languages.list()` with an optional `endpoint` filter), and
  `toRows()` (flatten + sort for the table).
- `Languages.tsx` — endpoint dropdown + fetch button + table / raw-JSON toggle.
- `LanguagesDetails.tsx` — request shape, headers, and parameter reference.

## Dependencies to copy

- shared: `../_shared/useCortiAccessToken.ts`
- local: `languagesApi.ts`
