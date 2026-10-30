/**
 * Minimal same-origin session identification via an httpOnly cookie. Used to
 * scope UI-supplied Corti credentials (see cortiToken.ts) to the browser that
 * submitted them, instead of a shared process-global — otherwise one tab's
 * pasted credentials would silently redirect every other tab/user's REST
 * calls to a different tenant.
 */
import crypto from "node:crypto";
import type { Request, Response } from "express";

const COOKIE_NAME = "corti_sid";
const SESSION_ID_PATTERN = /^[a-f0-9-]{36}$/;

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) {
    return out;
  }
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(value);
      } catch {
        out[key] = value;
      }
    }
  }
  return out;
}

/** Read this request's session id, minting and setting a new cookie if absent. */
export function getSessionId(req: Request, res: Response): string {
  const cookies = parseCookieHeader(req.headers.cookie);
  const existing = cookies[COOKIE_NAME];
  if (existing && SESSION_ID_PATTERN.test(existing)) {
    return existing;
  }

  const sid = crypto.randomUUID();
  const secure = req.secure ? "; Secure" : "";
  res.append("Set-Cookie", `${COOKIE_NAME}=${sid}; HttpOnly; SameSite=Strict; Path=/${secure}`);
  return sid;
}
