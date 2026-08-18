import { createHmac, timingSafeEqual } from "node:crypto";

// Shared HMAC secret; the minter (RAG_UI) and this verifier must use the SAME
// secret. Required with no default, so a deployment can never run with a
// guessable key (which would make token forging trivial). Production would more
// typically use asymmetric keys.
const SECRET: string = process.env.MCP_SCOPE_SECRET ?? "";
if (!SECRET) {
  throw new Error("MCP_SCOPE_SECRET must be set (refusing to start with a default secret).");
}

export interface ScopeClaims {
  sub?: string;
  scopes?: string[];
  // Optional display names per scope, e.g. { "patient:000-MOCK-5678": "John B. Placeholder" }.
  // Lets the MCP label passages by patient name so the agent can disambiguate by name.
  names?: Record<string, string>;
  aud?: string;
  exp: number; // required; verifyScopeToken rejects tokens without a numeric exp
}

function hmac(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

// Verify signature + expiry (constant-time compare). Returns the claims, or null
// if invalid/expired. Verify-only; RAG_UI mints the tokens.
export function verifyScopeToken(token: string, nowSeconds?: number): ScopeClaims | null {
  if (typeof token !== "string") {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [header, payload, signature] = parts;
  const expected = hmac(`${header}.${payload}`);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }
  let claims: ScopeClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ScopeClaims;
  } catch {
    return null;
  }
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || now >= claims.exp) {
    return null;
  }
  return claims;
}
