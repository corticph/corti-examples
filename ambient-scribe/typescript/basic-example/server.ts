/**
 * server.ts — Express server for AmbientScribe.
 *
 * Responsible for:
 *   1. Creating a fully-privileged CortiClient using OAuth2 client credentials.
 *   2. Exposing a POST /api/start-session endpoint that:
 *        a. Creates an interaction via the Corti REST API.
 *        b. Mints a scoped stream token (WebSocket access only).
 *        c. Returns both to the client.
 *   3. Serving the static front-end files (index.html, client.ts, audio.ts).
 *
 * IMPORTANT: Client credentials (CLIENT_ID / CLIENT_SECRET) must NEVER be
 * exposed to the browser.  Only the scoped stream token is sent to the client.
 */

import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { CortiClient, CortiAuth, type Corti } from "@corti/sdk";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Configuration — replace with your own values or load from environment
// ---------------------------------------------------------------------------

const TENANT_NAME = process.env.CORTI_TENANT_NAME ?? "YOUR_TENANT_NAME";
const CLIENT_ID = process.env.CORTI_CLIENT_ID ?? "YOUR_CLIENT_ID";
const CLIENT_SECRET = process.env.CORTI_CLIENT_SECRET ?? "YOUR_CLIENT_SECRET";
const CORTI_ENV = process.env.CORTI_ENVIRONMENT ?? "eu";
const PORT = Number(process.env.PORT ?? 3000);


// ---------------------------------------------------------------------------
// 1. Create a CortiClient authenticated with client credentials (OAuth2).
//    This client has full API access and must only be used server-side.
// ---------------------------------------------------------------------------

const client = new CortiClient({
  environment: CORTI_ENV,
  tenantName: TENANT_NAME,
  auth: {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
  },
});

// ---------------------------------------------------------------------------
// 2. Helper: create an interaction.
//    An interaction represents a single clinical encounter / session.
// ---------------------------------------------------------------------------

async function createInteraction() {
  const interaction = await client.interactions.create({
    encounter: {
      identifier: randomUUID(),
      status: "planned",
      type: "first_consultation",
    },
  });

  console.log("Interaction created:", interaction.interactionId);
  return interaction;
}

// ---------------------------------------------------------------------------
// 3. Helper: mint a scoped token with only the "streams" scope.
//    This token lets the client connect to the streaming WebSocket but
//    cannot list interactions, create documents, or call any other REST
//    endpoint — keeping the blast radius minimal if it leaks.
// ---------------------------------------------------------------------------

async function getScopedStreamToken() {
  const auth = new CortiAuth({
    environment: CORTI_ENV,
    tenantName: TENANT_NAME,
  });

  const streamToken = await auth.getToken({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    scopes: ["streams"],
  });

  return streamToken;
}

// ---------------------------------------------------------------------------
// 4. Express app
// ---------------------------------------------------------------------------

const app = express();

// Serve the front-end files (index.html, dist/client.js) from this directory.
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// POST /api/start-session
// Creates an interaction + scoped token and returns them to the client.
app.post("/api/start-session", async (_req, res) => {
  try {
    const interaction = await createInteraction();
    const streamToken = await getScopedStreamToken();

    // The client only receives the interaction ID, tenant name, and a limited-scope token.
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

// ---------------------------------------------------------------------------
// 5. POST /api/create-document
//    Fetches the facts collected during the consultation, then generates a
//    clinical document from them using the Corti Documents API.
// ---------------------------------------------------------------------------

app.post("/api/create-document", async (req, res) => {
  try {
    const { interactionId } = req.body;

    if (!interactionId) {
      res.status(400).json({ error: "Missing interactionId" });
      return;
    }

    // Step 1: Fetch facts collected during the consultation
    const {facts} = await client.facts.list(interactionId);
    console.log(`Fetched ${facts.length} facts for interaction ${interactionId}`);

    // Step 2: Map facts into the format expected by the Documents API
    const factsContext = facts.map(fact => ({
      text: fact.text,
      group: fact.group,
      source: fact.source,
    })) as Corti.FactsContext[];

    // Step 3: Create a document using the collected facts
    const document = await client.documents.create(interactionId, {
      context: [
        {
          type: "facts",
          data: factsContext,
        },
      ],
      template: {
        sections: [
          { key: "corti-hpi" },
          { key: "corti-allergies" },
          { key: "corti-social-history" },
          { key: "corti-plan" },
        ],
      },
      outputLanguage: "en",
      name: "Consultation Document",
      documentationMode: "routed_parallel",
    });

    console.log("Document created:", document);
    res.json({ document });
  } catch (err) {
    console.error("Failed to create document:", err);
    res.status(500).json({ error: "Failed to create document" });
  }
});

app.listen(PORT, () => {
  console.log(`AmbientScribe server listening on http://localhost:${PORT}`);
});
