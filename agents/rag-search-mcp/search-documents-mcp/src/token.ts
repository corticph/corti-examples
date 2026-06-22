import { createHmac, timingSafeEqual } from "node:crypto";

// Shared HMAC secret; the minter (RAG_UI) and this verifier must use the SAME
// secret. Production would more typically use asymmetric keys.
const SECRET = process.env.MCP_SCOPE_SECRET || "dev-shared-secret-change-me";

export interface ScopeClaims {
  sub?: string;
  scopes?: string[];
  // Optional display names per scope, e.g. { "patient:000-MOCK-5678": "John B. Placeholder" }.
  // Lets the MCP label passages by patient name so the agent can disambiguate by name.
  names?: Record<string, string>;
  aud?: string;
  iat?: number;
  exp?: number;
}

function hmac(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

// Verify signature + expiry (constant-time compare). Returns the claims, or null
// if invalid/expired. Verify-only — RAG_UI mints the tokens.
export function verifyScopeToken(token: string, nowSeconds?: number): ScopeClaims | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, pay, sig] = parts;
  const expected = hmac(`${head}.${pay}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let claims: ScopeClaims;
  try {
    claims = JSON.parse(Buffer.from(pay, "base64url").toString("utf8")) as ScopeClaims;
  } catch {
    return null;
  }
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && now >= claims.exp) return null;
  return claims;
}
