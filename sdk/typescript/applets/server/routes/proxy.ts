import type { Request, RequestHandler } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { getCreds, getFullScopeToken } from "../cortiToken";

const TOKEN_KEY = "__cortiToken";

export function cortiProxy(): RequestHandler {
  const { cluster, tenant } = getCreds();

  const proxy = createProxyMiddleware({
    target: `https://api.${cluster}.corti.app`,
    changeOrigin: true,
    pathRewrite: { "^/api/corti": "" },
    on: {
      proxyReq: (proxyReq, req) => {
        const token = (req as Request)[TOKEN_KEY as keyof Request] as string | undefined;
        if (token) {
          proxyReq.setHeader("Authorization", `Bearer ${token}`);
        }
        proxyReq.setHeader("Tenant-Name", tenant);
      },
    },
  });

  return async (req, res, next) => {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: attaching token to request object
      (req as any)[TOKEN_KEY] = await getFullScopeToken();
    } catch (err) {
      return next(err);
    }
    return proxy(req, res, next);
  };
}
