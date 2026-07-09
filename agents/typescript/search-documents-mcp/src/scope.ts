import { verifyScopeToken } from "./token.js";

// Authorization layer: turn a bearer token into allowed patient scopes, keyed
// per A2A contextId so every tool call in a conversation resolves the right scope.

const MCP_AUDIENCE = "search-documents-mcp";

export interface ScopeContext {
  allowed: string[]; // patient scopes the caller may see
  patientNames: Record<string, string>; // scope -> display name, for passage labels
  authed: boolean; // a valid scope token was present
}

const EMPTY: ScopeContext = { allowed: [], patientNames: {}, authed: false };

// Resolve scope from a bearer Authorization header (verify signature, expiry,
// audience). Missing/invalid/wrong-audience yields empty + authed:false.
export function scopeFromAuthHeader(authHeader?: string): ScopeContext {
  if (!authHeader || !/^bearer /i.test(authHeader)) {
    return EMPTY;
  }
  const claims = verifyScopeToken(authHeader.replace(/^bearer /i, "").trim());
  if (!claims) {
    console.error("[mcp] scope token missing or invalid");
    return EMPTY;
  }
  if (claims.aud !== MCP_AUDIENCE) {
    console.error(`[mcp] scope token audience mismatch (${claims.aud})`);
    return EMPTY;
  }
  return {
    allowed: Array.isArray(claims.scopes) ? claims.scopes : [],
    patientNames: claims.names ?? {},
    authed: true,
  };
}

// Process-local scope store keyed by contextId. Entries expire after a TTL so
// PHI scopes don't outlive their token or accumulate unbounded. For horizontal
// scaling, move to shared storage (the TTL carries over).
const SCOPE_TTL_MS = 10 * 60 * 1000; // refreshed on every bind; must exceed the token lifetime
const contextScopes = new Map<
  string,
  { allowed: string[]; patientNames: Record<string, string>; expiresAt: number }
>();

// Periodically drop expired entries so abandoned conversations don't leak memory.
// (Lazy eviction in scopeForContext only covers contexts that are read again.)
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of contextScopes) {
    if (now > entry.expiresAt) {
      contextScopes.delete(id);
    }
  }
}, 60 * 1000).unref();

export function bindContext(contextId: string, scopeContext: ScopeContext): void {
  contextScopes.set(contextId, {
    allowed: scopeContext.allowed,
    patientNames: scopeContext.patientNames,
    expiresAt: Date.now() + SCOPE_TTL_MS,
  });
}

// Resolve the scope for a contextId at tool-call time. Defaults to shared-only.
export function scopeForContext(contextId?: string) {
  const value = contextId ? contextScopes.get(contextId) : undefined;
  if (value && Date.now() > value.expiresAt) {
    contextScopes.delete(contextId!);
    return { allowed: [], patientNames: {} };
  }
  return (
    (value && { allowed: value.allowed, patientNames: value.patientNames }) || {
      allowed: [],
      patientNames: {},
    }
  );
}
