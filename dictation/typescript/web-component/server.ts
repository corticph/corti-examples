/**
 * server.ts — Express server for the Corti Dictation Web Component demos.
 *
 * Responsible for:
 *   1. Minting a scoped transcribe token via client credentials (never exposed to the browser).
 *   2. Serving the static HTML demo files.
 */

import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { CortiAuth } from "@corti/sdk";

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

// ---------------------------------------------------------------------------
// Helper: mint a scoped transcribe token.
// ---------------------------------------------------------------------------

async function getTranscribeToken() {
  const auth = new CortiAuth({ environment: CORTI_ENV, tenantName: TENANT_NAME });
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
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// POST /api/token
// Returns a short-lived transcribe-scoped access token for the browser.
app.post("/api/token", async (_req, res) => {
  try {
    const token = await getTranscribeToken();
    res.json({ accessToken: token.accessToken });
  } catch (err) {
    console.error("Failed to get token:", err);
    res.status(500).json({ error: "Failed to get token" });
  }
});

app.listen(PORT, () => {
  console.log(`Dictation Web Component demos: http://localhost:${PORT}`);
});
