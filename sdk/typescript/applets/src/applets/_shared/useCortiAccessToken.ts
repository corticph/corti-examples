/**
 * Bridges this app's existing Corti auth (useAuth / useCortiAuth) to the shape
 * the Corti SDK and web components expect.
 *
 * The SDK/web components derive `environment` (cluster) and `tenantName`
 * automatically by decoding the JWT `iss` claim
 * (https://auth.<cluster>.corti.app/realms/<tenant>), so all they need from the
 * host is a token and a way to refresh it. Passing only `refreshAccessToken`
 * is enough — including for non-prod clusters like dev-weu / staging-eu.
 *
 * PORTABILITY NOTE: in a standalone example, replace this hook with your own
 * token source — anything returning `{ accessToken, expiresIn? }`. Everything
 * else in the applets depends only on the returned `authConfig`.
 */
import { useCallback, useMemo } from "react";
import type { CortiAuth } from "@corti/sdk";
import { useAuth } from "./auth-context";
import { buildWsBaseUrl } from "./urls";

/**
 * SDK environment URLs. REST (`base`) and agents traffic route through the
 * local `/api/corti` proxy (server injects full-scope auth); WebSocket (`wss`)
 * stays direct to the cluster and carries the streaming-scoped token. `login`
 * is unused — we supply tokens via `refreshAccessToken`, not the SDK's own
 * token exchange.
 */
export interface CortiSdkEnvironment {
  base: string;
  wss: string;
  login: string;
  agents: string;
}

/** Decode a JWT's `exp` (seconds since epoch) without verifying the signature. */
function getTokenExp(token: string): number | undefined {
  const parts = token?.split(".");
  if (!parts || parts.length < 2) return undefined;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof payload.exp === "number" ? payload.exp : undefined;
  } catch {
    return undefined;
  }
}

export interface CortiAccessToken {
  /** Pass straight to a web component's `authConfig` prop or `CortiClient` auth. */
  authConfig: CortiAuth.AuthTokenDerivable;
  /** Get a fresh token imperatively (used by the raw-SDK applet). */
  refreshAccessToken: CortiAuth.AuthTokenDerivable["refreshAccessToken"];
  /** The cluster/tenant the token targets (for display only — SDK derives its own). */
  environment: string;
  tenantName: string;
  /** OAuth client id — used to namespace per-API-client configuration. */
  clientId: string;
  /** Pass to `new CortiClient({ environment })` so REST is proxied, WS direct. */
  sdkEnvironment: CortiSdkEnvironment;
  isReady: boolean;
}

export function useCortiAccessToken(): CortiAccessToken {
  const { authConfig, authenticate, isReady } = useAuth();

  const refreshAccessToken = useCallback(async () => {
    // authenticate() returns a fresh bearer token string; convert its JWT exp
    // into the relative expiresIn the SDK uses to schedule the next refresh.
    const accessToken = await authenticate();
    const exp = getTokenExp(accessToken);
    const expiresIn = exp
      ? Math.max(0, exp - Math.floor(Date.now() / 1000))
      : undefined;
    return { accessToken, expiresIn };
  }, [authenticate]);

  return useMemo<CortiAccessToken>(() => {
    const origin = window.location.origin;
    return {
      authConfig: {
        accessToken: authConfig.authToken || undefined,
        refreshAccessToken,
      },
      refreshAccessToken,
      environment: authConfig.cluster,
      tenantName: authConfig.tenant,
      clientId: authConfig.clientId,
      sdkEnvironment: {
        base: `${origin}/api/corti/v2`,
        agents: `${origin}/api/corti`,
        wss: authConfig.cluster ? buildWsBaseUrl(authConfig.cluster) : "",
        login: `https://auth.${authConfig.cluster}.corti.app/realms`,
      },
      isReady,
    };
  }, [
    authConfig.authToken,
    authConfig.cluster,
    authConfig.tenant,
    authConfig.clientId,
    refreshAccessToken,
    isReady,
  ]);
}
