/**
 * server.ts — Express server for the Ambient SDK basic example.
 *
 * Creates an interaction and mints a streams-scoped token for the browser.
 * Client credentials never leave the server.
 */

import { randomUUID } from "node:crypto";
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CortiAuth, CortiClient } from "@corti/sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function getScopedStreamToken() {
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

const app = express();
app.use(express.static(path.join(__dirname)));
app.use(express.json());

app.post("/api/start-session", async (_req, res) => {
  try {
    const interaction = await createInteraction();
    const streamToken = await getScopedStreamToken();

    res.json({
      interactionId: interaction.interactionId,
      tenantName: TENANT_NAME,
      environment: CORTI_ENV,
      accessToken: streamToken.accessToken,
    });
  } catch (err) {
    console.error("Failed to start session:", err);
    res.status(500).json({ error: "Failed to start session" });
  }
});

app.listen(PORT, () => {
  console.log(`Ambient SDK example listening on http://localhost:${PORT}`);
});
