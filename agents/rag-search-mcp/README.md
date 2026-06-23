# rag-search-mcp

A scoped RAG (retrieval-augmented generation) example for the Corti Agentic
Framework: an MCP server does per-patient document search, and a UI app wires it
to a Corti orchestrator. A clinician signs in and chats with the agent, with
retrieval scoped server-side to exactly the patients that clinician may see.

## Components

- **[search-documents-mcp](search-documents-mcp/)** — local MCP server exposing a
  single `search_documents` tool. On-device embeddings; results filtered by a
  verified scope token bound to the conversation's A2A `contextId`.
- **[rag-ui-corti](rag-ui-corti/)** — React + Express app that connects to Corti,
  provisions an orchestrator wired to the MCP, and provides clinician sign-in, a
  patient panel, scoped chat, and document upload.

## Running

Start and publicly expose the MCP first (its URL is required by the UI at
startup), then run the UI pointed at that URL. Each component's README has the
full setup, environment variables, and walkthrough.

## Note

This is a demo, not production-ready: `/ingest` is unauthenticated, the HMAC
secret has a dev default, and scope state is single-process. See
[search-documents-mcp/notes.md](search-documents-mcp/notes.md) for the upgrades
needed to host it beyond one instance.
