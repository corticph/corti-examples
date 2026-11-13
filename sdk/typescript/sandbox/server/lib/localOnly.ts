/**
 * Guard for every /api route. Requests without a session cookie fall back to
 * the .env / CLI credentials, and the proxy attaches a full-scope token, so the
 * API must only answer the sandbox's own page on this machine. This rejects:
 *  - cross-site requests from other pages open in the same browser (Origin
 *    doesn't match Host), and
 *  - DNS-rebinding pages (Host is an attacker-controlled name, not localhost).
 *
 * Anyone who deliberately serves the sandbox beyond loopback (HOST=0.0.0.0)
 * can allow extra hostnames via ALLOWED_HOSTS (comma-separated, no ports).
 */
import type { NextFunction, Request, Response } from "express";

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function allowedHostnames(): Set<string> {
  const extra = (process.env.ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...LOOPBACK_HOSTS, ...extra]);
}

/** Strip an optional `:port` suffix, keeping bracketed IPv6 literals intact. */
function hostnameOf(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, "");
}

export function isAllowedRequest(host: string | undefined, origin: string | undefined): boolean {
  if (!host || !allowedHostnames().has(hostnameOf(host))) {
    return false;
  }
  // Same-origin GETs from the page often omit Origin; browsers always send it
  // on cross-origin requests, so a missing Origin is not cross-site.
  if (!origin) {
    return true;
  }
  return origin === `http://${host}` || origin === `https://${host}`;
}

export function localOnly(req: Request, res: Response, next: NextFunction) {
  if (!isAllowedRequest(req.headers.host, req.headers.origin)) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  next();
}
