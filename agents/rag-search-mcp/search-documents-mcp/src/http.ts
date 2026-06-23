import "dotenv/config";
import express from "express";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server.js";
import { addDocument, count } from "./store.js";
import { scopeFromAuthHeader, bindContext, scopeForContext } from "./scope.js";

const DOCS_DIR = path.resolve(process.cwd(), "docs");

// The HTTP /ingest endpoint writes arbitrary content to docs/ and the index, and
// is unauthenticated. It stays disabled unless explicitly opted in, so tunneling
// the server doesn't accidentally expose a writable endpoint. The local CLI
// (npm run ingest) is unaffected. Enabling it does NOT add auth; restrict the
// endpoint before any real deployment.
const INGEST_ENABLED = process.env.ALLOW_INGEST === "true";

// Stateful: Corti only delivers an authenticated tools/call (carrying the A2A
// contextId) over a persistent session. Scope is keyed on contextId, not the
// session, so an unauthenticated session only ever sees shared docs.
const app = express();
app.use(express.json());

// Live sessions: sessionId -> transport. Persistence is what lets Corti issue an
// authenticated tools/call (scope is keyed by contextId, not held here).
const sessions: Record<string, { transport: StreamableHTTPServerTransport }> = {};

app.post("/mcp", async (req, res) => {
  const sessionId = req.header("mcp-session-id");
  const method = req.body?.method ?? "?";
  const hasAuth = req.header("authorization") ? "yes" : "no";

  // Bind this context's scope from any authenticated call carrying a contextId;
  // scopeForContext reads it back at tool-call time.
  const contextId =
    typeof req.body?.params?._meta?._contextId === "string" ? req.body.params._meta._contextId : undefined;
  const scopeContext = scopeFromAuthHeader(req.header("authorization"));
  if (contextId && scopeContext.authed) {
    bindContext(contextId, scopeContext);
    console.error(`[mcp] context ${contextId.slice(0, 8)} bound scopes=[${scopeContext.allowed.join(", ")}]`);
  }

  let transport: StreamableHTTPServerTransport;

  if (sessionId && sessions[sessionId]) {
    transport = sessions[sessionId].transport;
    console.error(`[mcp] ${method} | session=${sessionId.slice(0, 8)} REUSED | auth=${hasAuth} | ctx=${contextId?.slice(0, 8) ?? "none"}`);
  } else if (!sessionId && isInitializeRequest(req.body)) {
    console.error(`[mcp] initialize | NEW session | auth=${hasAuth}`);
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        sessions[newSessionId] = { transport };
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) delete sessions[transport.sessionId];
    };
    // Scope is resolved per tool-call by contextId; see scopeForContext.
    const server = createServer({ getScope: scopeForContext });
    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: no valid session ID provided" },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

// GET (server->client SSE) and DELETE (session termination) route to the
// existing session's transport.
async function handleSessionRequest(req: express.Request, res: express.Response) {
  const sessionId = req.header("mcp-session-id");
  if (!sessionId || !sessions[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await sessions[sessionId].transport.handleRequest(req, res);
}

app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);

// Pre-bind a context's scope at chat start, before any tool call races in. The
// bound scopes come from the verified token, never the request body.
app.post("/bind-context", (req, res) => {
  const contextId = typeof req.body?.contextId === "string" ? req.body.contextId : undefined;
  if (!contextId) {
    res.status(400).json({ error: "contextId is required." });
    return;
  }
  const scopeContext = scopeFromAuthHeader(req.header("authorization"));
  if (!scopeContext.authed) {
    res.status(401).json({ error: "A valid scope token is required." });
    return;
  }
  bindContext(contextId, scopeContext);
  console.error(`[mcp] context ${contextId.slice(0, 8)} PRE-BOUND scopes=[${scopeContext.allowed.join(", ")}]`);
  res.json({ ok: true, contextId, scopes: scopeContext.allowed });
});

// Add a document to the RAG index. Body: { source?, text, scope? }; scope
// defaults to "shared".
app.post("/ingest", async (req, res) => {
  if (!INGEST_ENABLED) {
    res.status(403).json({ error: "Ingest is disabled. Set ALLOW_INGEST=true to enable it." });
    return;
  }
  const { source, text, scope } = req.body ?? {};
  if (typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "Body must include a non-empty 'text' string." });
    return;
  }
  const name = typeof source === "string" && source.trim() ? source.trim() : "untitled";
  const resolvedScope = typeof scope === "string" && scope.trim() ? scope.trim() : "shared";
  const chunks = await addDocument(name, text, resolvedScope);

  // Persist to docs/ so it survives a full reindex (which rebuilds from docs/);
  // the scope front-matter re-applies the scope.
  try {
    await fs.mkdir(DOCS_DIR, { recursive: true });
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const file = /\.(md|txt)$/i.test(safe) ? safe : `${safe}.md`;
    await fs.writeFile(path.join(DOCS_DIR, file), `<!-- scope: ${resolvedScope} -->\n${text}\n`);
  } catch (err) {
    console.error("[ingest] failed to write docs/ file:", err);
  }

  res.json({ ok: true, source: name, scope: resolvedScope, chunks, totalChunks: await count() });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.error(`MCP HTTP server (stateful) listening on http://localhost:${PORT}/mcp`);
  if (INGEST_ENABLED) {
    console.error("[ingest] WARNING: /ingest is ENABLED and unauthenticated; do not expose it publicly without restricting access.");
  }
});
