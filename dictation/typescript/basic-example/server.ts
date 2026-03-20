/**
 * server.ts — Express server for Dictation demo.
 *
 * Responsible for:
 *   1. Creating a fully-privileged CortiClient using OAuth2 client credentials.
 *   2. Exposing a POST /api/start-session endpoint that:
 *        a. Mints a scoped transcribe token (WebSocket access only).
 *        b. Returns it together with tenant/environment info to the client.
 *   3. Serving the static front-end files (index.html, dist/client.js).
 *
 * IMPORTANT: Client credentials (CLIENT_ID / CLIENT_SECRET) must NEVER be
 * exposed to the browser. Only the scoped transcribe token is sent to the client.
 */

import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { CortiAuth, CortiEnvironment } from "@corti/sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Configuration — set via .env (copy .env.example to .env)
// ---------------------------------------------------------------------------

const TENANT_NAME = process.env.CORTI_TENANT_NAME ?? "YOUR_TENANT_NAME";
const CLIENT_ID = process.env.CORTI_CLIENT_ID ?? "YOUR_CLIENT_ID";
const CLIENT_SECRET = process.env.CORTI_CLIENT_SECRET ?? "YOUR_CLIENT_SECRET";
const CORTI_ENV = process.env.CORTI_ENVIRONMENT ?? "eu";
const PORT = Number(process.env.PORT ?? 3000);

const environment = CORTI_ENV === "us" ? CortiEnvironment.Us : CortiEnvironment.Eu;

// ---------------------------------------------------------------------------
// Helper: mint a scoped token with only the "transcribe" scope.
// This lets the browser connect to the transcription WebSocket but nothing else.
// ---------------------------------------------------------------------------

async function getScopedTranscribeToken() {
  const auth = new CortiAuth({ environment, tenantName: TENANT_NAME });
  return auth.getToken({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    scopes: ["transcribe"],
  });
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// POST /api/start-session
// Mints a scoped token and returns it together with connection info.
app.post("/api/start-session", async (_req, res) => {
  try {
    const token = await getScopedTranscribeToken();
    res.json({
      tenantName: TENANT_NAME,
      environment: CORTI_ENV,
      accessToken: token.accessToken,
    });
  } catch (err) {
    console.error("Failed to start session:", err);
    res.status(500).json({ error: "Failed to start session" });
  }
});

app.listen(PORT, () => {
  console.log(`Dictation server listening on http://localhost:${PORT}`);
});