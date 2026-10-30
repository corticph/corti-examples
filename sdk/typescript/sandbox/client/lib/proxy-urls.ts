/**
 * Server endpoints the browser talks to. Credentials live on the server (BYO
 * per-user); the browser never holds the secret or a full-scope token.
 *
 * - config: non-secret runtime config (cluster/tenant/clientId).
 * - streamToken: mints a streaming-only token for direct WS connections.
 * - corti: REST proxy — all REST goes here; the server injects auth.
 */

export const PROXY_URLS = {
  config: "/api/config",
  auth: "/api/auth/token",
  streamToken: "/api/auth/stream-token",
  corti: "/api/corti",
} as const;
