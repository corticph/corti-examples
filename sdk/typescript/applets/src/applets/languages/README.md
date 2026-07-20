# Applet: Languages

**Concept:** the `GET /v2/languages/` REST endpoint, which reports which
languages Corti speech to text supports and which endpoints
(`transcribe` / `streams` / `transcripts`) each is enabled for.

Pick an optional endpoint filter from the dropdown (default **All endpoints**),
click **Fetch languages**, and the authenticated GET runs against the live
cluster. Results render as a per-endpoint availability table (✓/✗ per endpoint)
or as the raw JSON body.

## Request

```
GET https://api.<cluster>.corti.app/v2/languages/[?endpoint=transcribe|streams|transcripts]
Authorization: Bearer <token>
Tenant-Name: <tenant>
```

The `endpoint` query param is appended only when a specific endpoint is chosen;
“All endpoints” sends the bare request and returns the full map.

## Key files

- `languagesApi.ts` — response types, `fetchLanguages(client, endpoint?)` via
  `CortiClient.languages.list`, and `toRows()` (flatten + sort for the table).
- `Languages.tsx` — endpoint dropdown + fetch button + table / raw-JSON toggle.
- `LanguagesDetails.tsx` — request shape, headers, and parameter reference.

## Dependencies to copy

- shared: `../_shared/useCortiAccessToken.ts`
- local: `languagesApi.ts`
