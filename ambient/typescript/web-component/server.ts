/**
 * server.ts — Express server for the Corti Ambient Web Component demos.
 *
 * Responsible for:
 *   1. Creating interactions and minting streams-scoped tokens via client credentials
 *      (never exposed to the browser).
 *   2. Serving the static HTML demo files.
 */

import { randomUUID } from "node:crypto";
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CortiAuth, CortiClient } from "@corti/sdk";

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

const client = new CortiClient({
  environment: CORTI_ENV,
  tenantName: TENANT_NAME,
  auth: {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
  },
});

async function createInteraction() {
  return client.interactions.create({
    encounter: {
      identifier: randomUUID(),
      status: "planned",
      type: "first_consultation",
    },
  });
}

async function getStreamToken() {
  const auth = new CortiAuth({
    environment: CORTI_ENV,
    tenantName: TENANT_NAME,
  });

  return auth.getToken({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    scopes: ["streams"],
  });
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// POST /api/start-session
// Creates an interaction and returns it with a streams-scoped access token.
app.post("/api/start-session", async (_req, res) => {
  try {
    const interaction = await createInteraction();
    const token = await getStreamToken();

    res.json({
      interactionId: interaction.interactionId,
      accessToken: token.accessToken,
    });
  } catch (err) {
    console.error("Failed to start session:", err);
    res.status(500).json({ error: "Failed to start session" });
  }
});

// POST /api/token
// Returns a short-lived streams-scoped access token for the browser.
app.post("/api/token", async (_req, res) => {
  try {
    const token = await getStreamToken();
    res.json({ accessToken: token.accessToken });
  } catch (err) {
    console.error("Failed to get token:", err);
    res.status(500).json({ error: "Failed to get token" });
  }
});

app.listen(PORT, () => {
  console.log(`Ambient Web Component demos: http://localhost:${PORT}`);
});
