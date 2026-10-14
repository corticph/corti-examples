/**
 * REST proxy: forwards `/api/corti/*` to the Corti API, injecting the
 * server-held full-scope token + Tenant-Name. The browser sends neither the
 * credential nor a token — this is best practice #3 (backend proxy for REST).
 *
 * IMPORTANT: mount this BEFORE express.json()/urlencoded() so POST bodies and
 * multipart recording uploads stream through untouched. Body parsers consume
 * the request stream and would break proxied writes.
 *
 * NOTE: http-proxy fires `proxyReq` SYNCHRONOUSLY and sends the upstream
 * request immediately, so the auth header cannot be set from an async handler
 * (the await resolves after headers are already flushed → 500). We resolve the
 * token in a wrapping middleware first, stash it on the request, then set the
 * header synchronously inside proxyReq.
 */
import type { Request, RequestHandler } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { getCreds, getFullScopeToken, hasCreds } from "../lib/cortiToken";
import { getSessionId } from "../lib/session";

const TOKEN_KEY = "__cortiToken" as const;
const TENANT_KEY = "__cortiTenant" as const;

interface CortiRequest extends Request {
  [TOKEN_KEY]?: string;
  [TENANT_KEY]?: string;
}

/**
 * Lazy proxy: one instance per cluster, created on first use. Cached by
 * cluster (not as a single shared instance) because credentials — and
 * therefore the target cluster — are scoped per browser session; two
 * concurrent sessions targeting different clusters must never share or race
 * on the same mutable proxy-target variable.
 */
export function cortiProxy(): RequestHandler {
  const proxiesByCluster = new Map<string, ReturnType<typeof createProxyMiddleware>>();

  function getProxyForCluster(cluster: string) {
    let proxy = proxiesByCluster.get(cluster);
    if (!proxy) {
      proxy = createProxyMiddleware({
        target: `https://api.${cluster}.corti.app`,
        changeOrigin: true,
        pathRewrite: { "^/api/corti": "" },
        on: {
          proxyReq: (proxyReq, innerReq) => {
            const token = (innerReq as CortiRequest)[TOKEN_KEY];
            if (token) {
              proxyReq.setHeader("Authorization", `Bearer ${token}`);
            }
            proxyReq.setHeader("Tenant-Name", (innerReq as CortiRequest)[TENANT_KEY] || "");
          },
        },
      });
      proxiesByCluster.set(cluster, proxy);
    }
    return proxy;
  }

  return async (req, res, next) => {
    const sessionId = getSessionId(req, res);
    if (!hasCreds(sessionId)) {
      return res
        .status(503)
        .json({ error: "NOT_CONFIGURED", message: "No Corti credentials configured" });
    }

    const { cluster, tenant } = getCreds(sessionId);
    const proxy = getProxyForCluster(cluster);

    try {
      (req as CortiRequest)[TOKEN_KEY] = await getFullScopeToken(sessionId);
      (req as CortiRequest)[TENANT_KEY] = tenant;
    } catch (err) {
      return next(err);
    }
    return proxy(req, res, next);
  };
}
