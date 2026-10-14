/**
 * Server-side Corti credential + token management.
 *
 * Credential model: BYO per-user. Each user supplies their OWN client_id/secret
 * either via env (`CORTI_CLIENT_ID` / `_SECRET` / `_ENVIRONMENT` / `_TENANT_NAME`, loaded
 * by `dotenv.config({ override: true })` in server/index.ts so a local .env
 * always wins over same-named vars already in the shell environment — e.g.
 * `CORTI_*` exported by opencode's model config) or by pasting them into the UI
 * form. Variable names match the format Corti supplies out of the box:
 * `CORTI_ENVIRONMENT` (cluster) and `CORTI_TENANT_NAME` (tenant).
 * Env creds are server-operator-trusted and shared by design. UI-form creds are
 * NOT — they are scoped to the browser session that submitted them (via the
 * cookie-based session id from `lib/session.ts`), so one browser's pasted
 * credentials can never override or leak into another browser's requests.
 *
 * The full-scope token is used ONLY by the REST proxy and never leaves this
 * process. The browser only ever receives streaming-scoped tokens (see
 * `getScopedToken`), whose blast radius is limited to the WS endpoints.
 */
import axios from "axios";

export interface CortiCreds {
  clientId: string;
  clientSecret: string;
  cluster: string;
  tenant: string;
}

// Constrain interpolated values to hostname-label shape so a malformed value
// cannot redirect the Keycloak request (mirrors the guard in routes/auth.ts).
const SAFE_IDENTIFIER = /^[a-z0-9-]+$/;

let envCredsCache: CortiCreds | null = null;
let envCredsError: Error | null = null;

// UI-form-supplied creds and the full-scope tokens minted from them, keyed by
// session id — deliberately NOT a shared/global singleton (see header comment).
const sessionCreds = new Map<string, CortiCreds>();
const sessionFullScope = new Map<string, { token: string; expMs: number }>();

function readEnvCreds(): CortiCreds {
  if (envCredsCache) {
    return envCredsCache;
  }
  if (envCredsError) {
    throw envCredsError;
  }

  const env = process.env;
  const cluster = env.CORTI_ENVIRONMENT ?? "dev-weu";
  const creds: Partial<CortiCreds> = {
    clientId: env.CORTI_CLIENT_ID,
    clientSecret: env.CORTI_CLIENT_SECRET,
    cluster,
    tenant: env.CORTI_TENANT_NAME,
  };

  if (!creds.clientId || !creds.clientSecret || !creds.tenant) {
    envCredsError = new Error(
      "Missing Corti credentials: set CORTI_CLIENT_ID, CORTI_CLIENT_SECRET, and CORTI_TENANT_NAME",
    );
    throw envCredsError;
  }
  if (!SAFE_IDENTIFIER.test(cluster) || !SAFE_IDENTIFIER.test(creds.tenant)) {
    envCredsError = new Error(
      "Invalid CORTI_ENVIRONMENT or CORTI_TENANT_NAME: must match ^[a-z0-9-]+$",
    );
    throw envCredsError;
  }

  envCredsCache = creds as CortiCreds;
  return envCredsCache;
}

/** Store UI-form-supplied credentials, scoped to one browser session. */
export function setRuntimeCreds(sessionId: string, creds: CortiCreds): void {
  sessionCreds.set(sessionId, creds);
  sessionFullScope.delete(sessionId); // invalidate that session's cached full-scope token
}

/**
 * Read credentials for a request: that session's own runtime creds (if any)
 * take priority; otherwise fall back to server-wide env creds. Omit
 * `sessionId` only for call sites with no request in scope (there are none
 * today, but the param stays optional so env-only usage doesn't need a dummy).
 */
export function getCreds(sessionId?: string): CortiCreds {
  if (sessionId) {
    const creds = sessionCreds.get(sessionId);
    if (creds) {
      return creds;
    }
  }
  return readEnvCreds();
}

/** True when valid credentials are present for this session — used to decide whether to prompt. */
export function hasCreds(sessionId?: string): boolean {
  if (sessionId && sessionCreds.has(sessionId)) {
    return true;
  }
  try {
    readEnvCreds();
    return true;
  } catch {
    return false;
  }
}

/**
 * True only when this request is served by the server's own env vars, not a
 * per-session UI-form override. Used to label the credential source in the
 * UI — runtime creds take priority for auth, but should never be reported as
 * "Env file" (they live in server memory scoped to this session, not in a
 * committed .env).
 */
export function isEnvConfigured(sessionId?: string): boolean {
  if (sessionId && sessionCreds.has(sessionId)) {
    return false;
  }
  try {
    readEnvCreds();
    return true;
  } catch {
    return false;
  }
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

async function mint(scope: string, sessionId?: string): Promise<TokenResponse> {
  const { clientId, clientSecret, cluster, tenant } = getCreds(sessionId);
  const url = `https://auth.${cluster}.corti.app/realms/${tenant}/protocol/openid-connect/token`;

  const { data } = await axios.post<TokenResponse>(
    url,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );
  return data;
}

// Cache the env-backed full-scope token used by the REST proxy; refresh ~30s
// before expiry. Per-session full-scope tokens are cached in `sessionFullScope`
// above instead, so one session's override can't clobber another's cache.
let envFullScope: { token: string; expMs: number } | null = null;

/** Full-scope token for the REST proxy. Never returned to the browser. */
export async function getFullScopeToken(sessionId?: string): Promise<string> {
  const usingSessionCreds = !!sessionId && sessionCreds.has(sessionId);
  const cached = usingSessionCreds ? sessionFullScope.get(sessionId!) : envFullScope;
  if (cached && Date.now() < cached.expMs - 30_000) {
    return cached.token;
  }

  const data = await mint("openid", sessionId);
  const entry = {
    token: data.access_token,
    expMs: Date.now() + data.expires_in * 1000,
  };
  if (usingSessionCreds) {
    sessionFullScope.set(sessionId!, entry);
  } else {
    envFullScope = entry;
  }
  return entry.token;
}

export type StreamScope = "transcribe" | "streams";

/**
 * Mint a streaming-only token for direct browser WS connections. The resulting
 * token is accepted ONLY by the corresponding WS endpoint(s), so exposing it to
 * the frontend has a limited blast radius.
 */
export async function getScopedToken(
  scopes: StreamScope[],
  sessionId?: string,
): Promise<TokenResponse> {
  const scope = ["openid", ...scopes].join(" ");
  return mint(scope, sessionId);
}
