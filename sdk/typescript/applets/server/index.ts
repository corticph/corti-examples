import "dotenv/config";
import express from "express";
import { getCreds, hasCreds } from "./cortiToken";
import authRouter from "./routes/auth";
import { cortiProxy } from "./routes/proxy";

export function createServer() {
  const app = express();

  if (hasCreds()) {
    app.use("/api/corti", cortiProxy());
  }

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/api/config", (_req, res) => {
    if (!hasCreds()) {
      return res.status(503).json({ error: "NOT_CONFIGURED" });
    }
    const { cluster, tenant, clientId } = getCreds();
    res.json({ cluster, tenant, clientId });
  });

  app.use("/api/auth", authRouter);

  return app;
}
