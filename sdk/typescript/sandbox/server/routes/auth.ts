import axios from "axios";
import { Router } from "express";
import { getScopedToken, type StreamScope, setRuntimeCreds } from "../lib/cortiToken";
import { getSessionId } from "../lib/session";

const router = Router();

const VALID_STREAM_SCOPES = new Set<StreamScope>(["transcribe", "streams"]);
const SAFE_IDENTIFIER = /^[a-z0-9-]+$/;

/**
 * Accept user-supplied credentials from the UI form, validate them against
 * Keycloak, cache them as runtime credentials (so the REST proxy can use them),
 * and return a streaming-scoped token. This is the browser-entry-point for
 * installations without a .env file.
 */
router.post("/token", async (req, res) => {
  const { client_id, client_secret, cluster, tenant } = req.body ?? {};

  if (!client_id || !client_secret || !cluster || !tenant) {
    return res.status(400).json({
      error: "BAD_REQUEST",
      message: "client_id, client_secret, cluster, and tenant are required",
    });
  }
  if (!SAFE_IDENTIFIER.test(cluster) || !SAFE_IDENTIFIER.test(tenant)) {
    return res.status(400).json({
      error: "BAD_REQUEST",
      message: "cluster and tenant must match ^[a-z0-9-]+$",
    });
  }

  const url = `https://auth.${cluster}.corti.app/realms/${tenant}/protocol/openid-connect/token`;

  try {
    const { data } = await axios.post<{ access_token: string; expires_in: number }>(
      url,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id,
        client_secret,
        scope: "openid transcribe streams",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    const sessionId = getSessionId(req, res);
    setRuntimeCreds(sessionId, { clientId: client_id, clientSecret: client_secret, cluster, tenant });
    res.json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (error) {
    const isAxiosError = axios.isAxiosError(error);
    const status = (isAxiosError && error.response?.status) || 500;
    res.status(status).json({
      error: (isAxiosError && error.response?.data?.error) || "AUTH_FAILED",
      message:
        (isAxiosError && (error.response?.data?.error_description || error.message)) ||
        "Authentication failed",
    });
  }
});

/**
 * Mint a streaming-only token for direct browser WS connections. No credentials
 * are accepted in the request — the server holds them. The returned token is
 * limited-scope (openid transcribe|streams), so it is safe to expose to the
 * frontend (best practice #4).
 */
router.post("/stream-token", async (req, res) => {
  try {
    const requested: unknown = req.body?.scopes;
    const scopes = (Array.isArray(requested) ? requested : []).filter((s): s is StreamScope =>
      VALID_STREAM_SCOPES.has(s as StreamScope),
    );
    if (scopes.length === 0) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "scopes must include 'transcribe' and/or 'streams'",
      });
    }

    const sessionId = getSessionId(req, res);
    const { access_token, expires_in } = await getScopedToken(scopes, sessionId);
    res.json({ access_token, expires_in });
  } catch (error) {
    const isAxiosError = axios.isAxiosError(error);
    console.error("Stream-token error:", {
      message: isAxiosError ? error.message : error,
      status: isAxiosError ? error.response?.status : undefined,
      data: isAxiosError ? error.response?.data : undefined,
    });
    res.status((isAxiosError && error.response?.status) || 500).json({
      error: (isAxiosError && error.response?.data?.error) || "TOKEN_FAILED",
      message:
        (isAxiosError && (error.response?.data?.error_description || error.message)) ||
        "Failed to mint scoped token",
    });
  }
});

export default router;
