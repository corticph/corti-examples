# search-documents-mcp

A local [MCP](https://modelcontextprotocol.io) server exposing a single
document-search (RAG) tool with **per-patient access control**. Embeddings run
on-device, so document text never leaves the machine. It's the retrieval half of
a shareable demo; the UI half is [rag-ui-corti](../rag-ui-corti).

## What it does

- Exposes one tool, **`search_documents`** — semantic search over the indexed
  docs. Returns the top-K most relevant passages, each labelled with its source
  and patient (or `reference` for shared docs).
- **Scopes results** to what the caller's verified token allows: shared
  reference docs are visible to everyone; patient records are only returned to a
  caller granted that patient's scope. No valid token → shared docs only.
- The server **retrieves**; it does not generate. The Corti orchestrator writes
  the answer from the returned passages.

## High-level flow

```
Corti orchestrator ──tools/call (search_documents)──▶ this MCP
   carries a signed scope token (_meta._contextId + Authorization)
        │                                                  │
        │              returns scoped passages ◀───────────┘
        ▼
 writes the grounded answer
```

The MCP verifies the scope token, records the allowed patient scopes against the
A2A `contextId`, and filters retrieval to those scopes on every call in that
conversation.

## Setup

```bash
npm install
cp .env.example .env     # optional — defaults work for a local demo
npm run build            # compile src/ (TypeScript) → build/
npm run reindex          # build the document index from docs/
```

> The first ingest/search downloads the embedding model
> (`Xenova/all-MiniLM-L6-v2`) into `node_modules/.cache`. Later runs are fast.

## Running

```bash
npm run start:http    # HTTP server on :3000 at /mcp — use with ngrok + Corti
```

To connect it to Corti, expose `:3000` publicly (e.g. `ngrok http 3000`) and put
that URL (`https://<tunnel>/mcp`) into rag-ui-corti's `MCP_URL`.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MCP_SCOPE_SECRET` | `dev-shared-secret-change-me` | HMAC secret used to verify scope tokens. **MUST match the same variable in rag-ui-corti**, or every token is rejected and retrieval falls back to shared docs only. |
| `PORT` | `3000` | Port for the HTTP server (`start:http`). |

The token **audience** the server accepts is `search-documents-mcp` (constant in
`src/http.ts`); rag-ui-corti mints tokens with the same audience.

## Adding documents

Documents live in [docs/](docs/) as `.txt` or `.md` files.

```bash
npm run ingest      # index every .txt/.md in docs/ (adds new, updates changed)
npm run reindex     # wipe the index first, then re-ingest (use after deleting
                    # or renaming files so orphaned chunks are dropped)
```

Ingest is idempotent: re-ingesting the same filename replaces that file's chunks
rather than duplicating them. The index is written to `data/index.json`. You can
also add a document at runtime:

```bash
curl -X POST http://localhost:3000/ingest \
  -H 'content-type: application/json' \
  -d '{"source":"note-1","text":"the document body","scope":"shared"}'
```

### Access control / scoping

Each chunk carries a scope. `shared` docs (guidelines, policies) are visible to
everyone. Patient records carry `patient:<MRN>` and are only returned to callers
whose verified token grants that scope.

A document declares its scope with an HTML comment on the first line (invisible
in rendered markdown). Untagged docs default to `shared`:

```markdown
<!-- scope: patient:000-MOCK-1234 -->
# Discharge Summary
...
```

Scope precedence: explicit `scope` in an HTTP `/ingest` call → front-matter tag →
`shared`. A caller with no valid token sees shared docs only (deny by default).

## Authorization & sessions

The server is **stateful** (it issues an `Mcp-Session-Id`) — this is required so
Corti delivers an *authenticated* tool call carrying the `contextId`, which is
what binds the conversation's scope. Authorization itself is keyed on that
verified `contextId`, **not** on session state, so a stray unauthenticated
session can only ever reach shared docs (never PHI).

rag-ui-corti also calls **`POST /bind-context`** at chat start to pre-bind a
conversation's scope (with a verified token) before any tool call races in, so
the first question is already scoped. Either path binds the same way; the bound
scopes always come from the verified token, never the request body. See
[notes.md](notes.md) for the upgrades needed to host this beyond a single
instance.

## Hardcoded / mock data

The docs in [docs/](docs/) are fictional sample clinical notes (clearly marked
MOCK, no real PHI). The patient MRNs (e.g. `000-MOCK-1234`) are deliberately
matched to the mock patient/clinician directory in rag-ui-corti so the
access-control demo lines up end to end.

## Layout

```
src/
  http.ts     HTTP entrypoint (Express): /mcp + /bind-context + /ingest
  server.ts   MCP server + the search_documents tool
  scope.ts    token-based authorization; scope bound per A2A contextId
  store.ts    chunking, embedding, persistence, scoped search
  embed.ts    local embedding model (transformers.js)
  ingest.ts   CLI batch ingest of docs/
  token.ts    scope-token verification (HMAC); rag-ui-corti mints them
docs/         source documents (scope-tagged)
data/         index.json (generated)
notes.md      architectural upgrades for hosting elsewhere
```
