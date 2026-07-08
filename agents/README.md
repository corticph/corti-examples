# rag-search-mcp

A scoped RAG (retrieval-augmented generation) example for the Corti Agentic
Framework: an MCP server does per-patient document search, and a UI app wires it
to a Corti orchestrator. A clinician signs in and chats with the agent, with
retrieval scoped server-side to exactly the patients that clinician may see.

## Components

- **[search-documents-mcp](typescript/search-documents-mcp/)** — local MCP server exposing a
  single `search_documents` tool. On-device embeddings; results filtered by a
  verified scope token bound to the conversation's A2A `contextId`.
- **[rag-ui-corti](react/rag-ui-corti/)** — React + Express app that connects to Corti,
  provisions an orchestrator wired to the MCP, and provides clinician sign-in, a
  patient panel, scoped chat, and document upload.

## Running

Start and publicly expose the MCP first (its URL is required by the UI at
startup), then run the UI pointed at that URL. Each component's README has the
full setup, environment variables, and walkthrough.

## Production notes

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
