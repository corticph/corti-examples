import "dotenv/config";
import express from "express";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---- .env profile import (one-click seed for the Profiles page) ----
// Accepts both the typo'd var names that have shipped and the correctly-spelled ones.
function readEnv() {
  return {
    clientId: process.env.CORTI_CLIENT_ID ?? "",
    clientSecret: process.env.CORTI_CLIENT_SECRET ?? process.env.CORTI_CLIENT_SECERET ?? "",
    region: process.env.CORTI_ENVIRONMENT_ID ?? process.env.CORTI_ENVIROMENT_ID ?? "eu",
    tenant: process.env.CORTI_TENANT_NAME ?? "base",
  };
}

app.get("/api/auth/env", (_req, res) => {
  const env = readEnv();
  res.json({
    hasCredentials: Boolean(env.clientId && env.clientSecret),
    ...env,
  });
});

// ---- Token minting: takes profile fields in the body, proxies to Corti auth ----
app.post("/api/auth/token", async (req, res) => {
  const body = req.body ?? {};
  const clientId = String(body.clientId ?? "");
  const clientSecret = String(body.clientSecret ?? "");
  const region = String(body.region ?? "eu");
  const tenant = String(body.tenant ?? "base");

  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: "clientId and clientSecret are required" });
  }

  const tokenUrl = `https://auth.${region}.corti.app/realms/${tenant}/protocol/openid-connect/token`;
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "openid",
  });

  try {
    const r = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const text = await r.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!r.ok) return res.status(r.status).json({ error: data, tokenUrl });
    res.json({
      accessToken: data.access_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    });
  } catch (e: any) {
    res.status(502).json({ error: e?.message ?? String(e), tokenUrl });
  }
});

const PORT = 5174;
app.listen(PORT, () => {
  console.log(`[server] dev API listening on http://localhost:${PORT}`);
});
