import { verifyScopeToken } from "./token.js";

// Authorization layer: turn a bearer token into allowed patient scopes, keyed
// per A2A contextId so every tool call in a conversation resolves the right scope.

const MCP_AUDIENCE = "search-documents-mcp";

export interface ScopeContext {
  allowed: string[];                     // patient scopes the caller may see
  patientNames: Record<string, string>;  // scope -> display name, for passage labels
  authed: boolean;                        // a valid scope token was present
}

const EMPTY: ScopeContext = { allowed: [], patientNames: {}, authed: false };

// Resolve scope from a bearer Authorization header (verify signature, expiry,
// audience). Missing/invalid/wrong-audience yields empty + authed:false.
export function scopeFromAuthHeader(authHeader?: string): ScopeContext {
  if (!authHeader || !/^bearer /i.test(authHeader)) return EMPTY;
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

// Process-local scope store keyed by contextId — for horizontal scaling, move
// to shared storage + a TTL.
const contextScopes = new Map<string, { allowed: string[]; patientNames: Record<string, string> }>();

export function bindContext(contextId: string, scopeCtx: ScopeContext): void {
  contextScopes.set(contextId, { allowed: scopeCtx.allowed, patientNames: scopeCtx.patientNames });
}

// Resolve the scope for a contextId at tool-call time. Defaults to shared-only.
export function scopeForContext(contextId?: string) {
  return (contextId && contextScopes.get(contextId)) || { allowed: [], patientNames: {} };
}
