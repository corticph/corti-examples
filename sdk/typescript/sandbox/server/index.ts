import dotenv from "dotenv";

// The CLI (bin/cli.mjs) has already loaded .env and applied its --tenant /
// --cluster / --client-id flags on top; overriding here would undo them.
dotenv.config({ override: !process.env.CORTI_SANDBOX_BIN });

import express from "express";
import { getCreds, hasCreds } from "./lib/cortiToken";
import { localOnly } from "./lib/localOnly";
import { getSessionId } from "./lib/session";
import authRouter from "./routes/auth";
import { cortiProxy } from "./routes/corti-proxy";

export function createServer() {
  const app = express();

  // Only answer the sandbox's own page on this machine (see lib/localOnly.ts).
  app.use("/api", localOnly);

  // REST proxy MUST be mounted before the body parsers so POST bodies and
  // multipart recording uploads stream through to Corti untouched. The proxy
  // initialises lazily on first request, so the server boots without a .env.
  app.use("/api/corti", cortiProxy());

  app.use(express.json());

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  // Non-secret runtime config for the SPA — replaces VITE_ vars in the browser.
  // Never includes the secret or any token.
  app.get("/api/config", (req, res) => {
    const sessionId = getSessionId(req, res);
    if (!hasCreds(sessionId)) {
      return res.status(503).json({ error: "NOT_CONFIGURED" });
    }
    const { cluster, tenant, clientId } = getCreds(sessionId);
    res.json({ cluster, tenant, clientId });
  });

  app.use("/api/auth", authRouter);

  return app;
}
