import path from "node:path";
import { fileURLToPath } from "node:url";
import * as express from "express";
import { createServer } from "./index";

/**
 * Build the production app: the API/proxy routes from createServer() plus the
 * built SPA served from dist/spa, with a client-side-routing fallback.
 */
export function buildProdApp() {
  const app = createServer();

  // Resolve via import.meta.url (works on Node 18+) rather than
  // import.meta.dirname (Node 20.11+ only) so we honor the >=18 engines range.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(__dirname, "../spa");

  app.use(express.static(distPath));

  // SPA fallback for client-side routes. Implemented as a final middleware
  // (not app.get("*")) to stay compatible with Express 5's path matching.
  app.use((req, res, next) => {
    if (req.method !== "GET") {
      return next();
    }
    if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
      return res.status(404).json({ error: "API endpoint not found" });
    }
    res.sendFile(path.join(distPath, "index.html"));
  });

  return app;
}

/** Start the production server and wire graceful shutdown. */
export function startProdServer(port: number = Number(process.env.PORT) || 3000) {
  const app = buildProdApp();

  const server = app.listen(port, () => {
    console.log(`Corti SDK Sandbox running at http://localhost:${port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down.`);
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return server;
}

// Auto-start for `npm run start` (node dist/server/node-build.mjs). The bin
// sets CORTI_SANDBOX_BIN so it can own startup (creds prompt, port, open) and
// call startProdServer() itself.
if (!process.env.CORTI_SANDBOX_BIN) {
  startProdServer();
}
