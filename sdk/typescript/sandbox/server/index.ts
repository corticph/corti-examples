import dotenv from "dotenv";
dotenv.config({ override: true });
import cors from "cors";
import express from "express";
import { getCreds, hasCreds } from "./lib/cortiToken";
import authRouter from "./routes/auth";
import { cortiProxy } from "./routes/corti-proxy";
import { getSessionId } from "./lib/session";

export function createServer() {
  const app = express();

  app.use(cors());

  // REST proxy MUST be mounted before the body parsers so POST bodies and
  // multipart recording uploads stream through to Corti untouched. The proxy
  // initialises lazily on first request, so the server boots without a .env.
  app.use("/api/corti", cortiProxy());

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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
