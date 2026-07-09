# search-documents-mcp

A local [MCP](https://modelcontextprotocol.io) server exposing a single
document-search (RAG) tool with **per-patient access control**. Embeddings run
on-device, so document text never leaves the machine. It's the retrieval half of
a shareable demo; the UI half is [search-documents-ui](../../react/search-documents-ui).

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
cp .env.example .env     # then set MCP_SCOPE_SECRET (required)
npm run build            # compile src/ (TypeScript) → build/
npm run reindex          # optional on first run — a prebuilt index is committed
```

> **First run:** `data/index.json` is committed, so you can skip `npm run reindex`
> and go straight to [Running](#running). Re-run it only after you add or change
> files in `docs/`.
>
> The first reindex/search downloads the embedding model
> (`Xenova/all-MiniLM-L6-v2`) into `node_modules/.cache`, so skipping reindex also
> defers that one-time download until you need it. Later runs are fast.

## Running

```bash
npm run start:http    # HTTP server on :3000 at /mcp — use with ngrok + Corti
```

To connect it to Corti, expose `:3000` publicly (e.g. `ngrok http 3000`) and put
that URL (`https://<tunnel>/mcp`) into search-documents-ui's `MCP_URL`.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MCP_SCOPE_SECRET` | **required** | HMAC secret used to verify scope tokens. No default: the server refuses to start if unset, so tokens can't be forged with a guessable key. **MUST match the same variable in search-documents-ui**, or every token is rejected and retrieval falls back to shared docs only. Generate one with `openssl rand -hex 32`. |
| `ALLOW_INGEST` | `false` | Enables the HTTP `/ingest` endpoint (required for search-documents-ui's upload page). Off by default so a tunneled server doesn't expose an unauthenticated writable endpoint. Enabling adds no auth, so don't expose `/ingest` publicly without restricting access. |
| `PORT` | `3000` | Port for the HTTP server (`start:http`). |

The token **audience** the server accepts is `search-documents-mcp` (constant in
`src/http.ts`); search-documents-ui mints tokens with the same audience.

## Adding documents

Documents live in [docs/](docs/) as `.txt` or `.md` files.

```bash
npm run ingest      # index every .txt/.md in docs/ (adds new, updates changed)
npm run reindex     # wipe the index first, then re-ingest (use after deleting
                    # or renaming files so orphaned chunks are dropped)
```

Ingest is idempotent: re-ingesting the same filename replaces that file's chunks
rather than duplicating them. The index is written to `data/index.json`.

You can also add a document at runtime over HTTP, but the `/ingest` endpoint is
**disabled by default** (it's unauthenticated and writes to disk; the default-off
state keeps a tunneled server from exposing a writable endpoint). Enable it with
`ALLOW_INGEST=true` — this is also required for search-documents-ui's upload page. Never
expose `/ingest` publicly without restricting access.

```bash
ALLOW_INGEST=true npm run start:http
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

search-documents-ui also calls **`POST /bind-context`** at chat start to pre-bind a
conversation's scope (with a verified token) before any tool call races in, so
the first question is already scoped. Either path binds the same way; the bound
scopes always come from the verified token, never the request body.

## Hardcoded / mock data

The docs in [docs/](docs/) are fictional sample clinical notes (clearly marked
MOCK, no real PHI). The patient MRNs (e.g. `000-MOCK-1234`) are deliberately
matched to the mock patient/clinician directory in search-documents-ui so the
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
  token.ts    scope-token verification (HMAC); search-documents-ui mints them
docs/         source documents (scope-tagged)
data/         index.json (generated)
```

## Production considerations

This is a demo, not production-ready: `/ingest` is unauthenticated, the HMAC
secret has a dev default, and scope state is single-process. To host it for real:

**Single instance (minimum):**

- Serve behind a stable HTTPS endpoint / gateway instead of a tunnel.
- Containerize — pin the Node version and bake in the embedding model.
- Load `MCP_SCOPE_SECRET` from a secret manager, not a dev default.
- Authenticate or network-restrict the `/ingest` write endpoint.
- Add `/healthz`, structured logging, and graceful shutdown.

**Horizontal scaling (multiple instances):**

- Route sessions stickily by `Mcp-Session-Id` — a transport can't move between instances.
- Move the per-conversation scope cache to Redis with a TTL, since auth and tool calls may hit different instances.
- Move the vector index from `data/index.json` to a shared vector DB (pgvector, Qdrant, etc.).
- Optionally offload embeddings to a hosted or dedicated embedding service.

**Hardening (any deployment):**

- Replace the shared HMAC secret with asymmetric signing keys plus rotation.
- Restrict `/mcp` to Corti's egress (IP allowlist / mTLS / gateway).
- Confirm `shared`-tagged docs contain no real PHI.
- Add metrics and tracing.
