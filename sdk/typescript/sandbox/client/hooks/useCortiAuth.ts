import { useCallback, useEffect, useMemo, useState } from "react";
import { PROXY_URLS } from "../lib/proxy-urls";
import {
  type AuthConfig,
  buildApiUrl,
  buildWsBaseUrl,
  type InteractionResponse,
} from "../types/websocket";

const STORAGE_KEY = "corti-sandbox-auth";

type StreamScope = "transcribe" | "streams";

export type EnvPreset = "custom";

function loadStoredConfig(): Partial<AuthConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    // Never persist the secret or token
    const { clientSecret: _s, authToken: _t, ...safe } = parsed;
    return safe;
  } catch {
    return {};
  }
}

function saveConfig(cfg: AuthConfig) {
  try {
    const { clientSecret: _s, authToken: _t, ...safe } = cfg;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    /* ignore */
  }
}

export function useCortiAuth() {
  const [authConfig, setAuthConfig] = useState<AuthConfig>(() => ({
    clientId: "",
    clientSecret: "",
    cluster: "dev-weu",
    tenant: "",
    ...loadStoredConfig(),
  }));
  const [isServerConfigured, setIsServerConfigured] = useState(false);

  const [authStatus, setAuthStatus] = useState<{
    step: "idle" | "authenticating" | "creating_interaction" | "ready" | "error";
    isLoading: boolean;
    error?: string;
    interaction?: InteractionResponse;
  }>({ step: "idle", isLoading: false });

  const [currentPreset, setCurrentPreset] = useState<EnvPreset | "custom">("custom");

  // Persist non-secret config to localStorage whenever it changes.
  useEffect(() => {
    saveConfig(authConfig);
  }, [authConfig]);

  // Try to load non-secret config from the server (env-vars mode).
  // If the server isn't configured this returns 503 — we fall back to the
  // manually entered values already in state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(PROXY_URLS.config);
        if (!res.ok) {
          return;
        }
        const cfg = await res.json();
        if (cancelled) {
          return;
        }
        setAuthConfig((prev) => ({
          ...prev,
          cluster: cfg.cluster || prev.cluster,
          tenant: cfg.tenant || prev.tenant,
          clientId: cfg.clientId || prev.clientId,
          wsBaseUrl: cfg.cluster ? buildWsBaseUrl(cfg.cluster) : prev.wsBaseUrl,
        }));
        setIsServerConfigured(!!(cfg.cluster && cfg.tenant));
      } catch (error) {
        console.warn("Failed to load /api/config:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateAuthConfig = useCallback((updates: Partial<AuthConfig>) => {
    setAuthConfig((prev) => ({
      ...prev,
      ...updates,
      wsBaseUrl: updates.cluster ? buildWsBaseUrl(updates.cluster) : prev.wsBaseUrl,
    }));
    setCurrentPreset("custom");
  }, []);

  const loadPreset = useCallback((_preset: EnvPreset | "custom") => {
    setCurrentPreset("custom");
  }, []);

  const clearAuth = useCallback(() => {
    setAuthConfig((prev) => ({ ...prev, authToken: "" }));
    setAuthStatus({ step: "idle", isLoading: false });
  }, []);

  // Mint a streaming-scoped token from the server. No credentials are sent —
  // the server holds them. The returned token is limited to the WS endpoints.
  const getStreamToken = useCallback(async (scopes: StreamScope[]): Promise<string> => {
    setAuthStatus({ step: "authenticating", isLoading: true });

    try {
      const response = await fetch(PROXY_URLS.streamToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes }),
      });

      if (!response.ok) {
        let errorText = `HTTP ${response.status}`;
        try {
          errorText = await response.text();
        } catch {
          /* fall through to status */
        }
        throw new Error(`Token request failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      if (!data.access_token) {
        throw new Error("No access token in response");
      }

      setAuthConfig((prev) => ({ ...prev, authToken: data.access_token }));
      return data.access_token;
    } catch (error) {
      let errorMessage = "Authentication failed";
      if (error instanceof TypeError && error.message.includes("fetch")) {
        errorMessage = "Network error: cannot reach the local server. Make sure it is running.";
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      console.error("Authentication error:", error);
      setAuthStatus({ step: "error", isLoading: false, error: errorMessage });
      throw new Error(errorMessage);
    }
  }, []);

  // Create Interaction (for /streams). Goes through the REST proxy, which
  // injects the Authorization + Tenant-Name headers server-side.
  const createInteraction = useCallback(async (): Promise<InteractionResponse> => {
    setAuthStatus({ step: "creating_interaction", isLoading: true });

    const interactionEndpoint = `${buildApiUrl()}/v2/interactions/`;

    const payload = {
      assignedUserId: null,
      encounter: {
        identifier: `corti-sdk-sandbox-${Date.now()}`,
        status: "planned",
        type: "consultation",
        period: {
          start: new Date().toISOString(),
          end: new Date(Date.now() + 60 * 60000).toISOString(), // 1 hour
        },
        title: "Corti SDK Sandbox Session",
      },
      patient: {
        identifier: "test-patient-1",
        name: "Test Patient",
        gender: "unknown",
        birthDate: "1990-01-01T00:00:00Z",
        pronouns: "They/Them",
      },
    };

    try {
      const response = await fetch(interactionEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Interaction creation failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      if (!data.interactionId || !data.websocketUrl) {
        throw new Error("Invalid interaction response - missing interactionId or websocketUrl");
      }

      const interaction: InteractionResponse = {
        interactionId: data.interactionId,
        websocketUrl: data.websocketUrl,
      };

      setAuthStatus({ step: "ready", isLoading: false, interaction });
      return interaction;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Interaction creation failed";
      setAuthStatus({ step: "error", isLoading: false, error: errorMessage });
      throw error;
    }
  }, []);

  // Authenticate using credentials entered in the UI form. Posts to the server
  // which validates with Keycloak, caches the runtime creds, and returns a
  // streaming-scoped token.
  const authenticateWithUiCreds = useCallback(async (): Promise<string> => {
    setAuthStatus({ step: "authenticating", isLoading: true });
    try {
      const response = await fetch(PROXY_URLS.auth, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: authConfig.clientId,
          client_secret: authConfig.clientSecret,
          cluster: authConfig.cluster,
          tenant: authConfig.tenant,
        }),
      });
      if (!response.ok) {
        let msg = `Token request failed (${response.status})`;
        try {
          const body = await response.json();
          msg = body.message || body.error_description || msg;
        } catch {
          try {
            msg = await response.text();
          } catch {
            /* fall through */
          }
        }
        throw new Error(msg);
      }
      const data = await response.json();
      if (!data.access_token) {
        throw new Error("No access token in response");
      }
      setAuthConfig((prev) => ({ ...prev, authToken: data.access_token }));
      setAuthStatus({ step: "ready", isLoading: false });
      return data.access_token;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Authentication failed";
      setAuthStatus({ step: "error", isLoading: false, error: msg });
      throw new Error(msg);
    }
  }, [authConfig.clientId, authConfig.clientSecret, authConfig.cluster, authConfig.tenant]);

  // App-wide authentication: prefer the server's own configured creds
  // (env-vars) when present, since those are the trusted, already-validated
  // path — only fall back to whatever the user has typed into the form when
  // the server isn't configured. This avoids submitting a half-typed secret
  // just because the field happens to be non-empty while env creds are ready.
  const authenticate = useCallback(async (): Promise<string> => {
    if (!isServerConfigured && authConfig.clientSecret) {
      return authenticateWithUiCreds();
    }
    const token = await getStreamToken(["transcribe", "streams"]);
    setAuthStatus({ step: "ready", isLoading: false });
    return token;
  }, [isServerConfigured, authConfig.clientSecret, authenticateWithUiCreds, getStreamToken]);

  // Kept as a distinct entry point for the transcribe-only WS flow.
  const authenticateForTranscribe = useCallback(async (): Promise<string> => {
    const token = await getStreamToken(["transcribe"]);
    setAuthStatus({ step: "ready", isLoading: false });
    return token;
  }, [getStreamToken]);

  // For streams endpoint (requires interaction)
  const buildWebSocketUrl = useCallback(
    (interactionId: string, token: string): string => {
      if (!authConfig || !authConfig.wsBaseUrl || !authConfig.tenant) {
        throw new Error("Invalid auth configuration for WebSocket URL");
      }
      return `${authConfig.wsBaseUrl}/interactions/${interactionId}/streams?tenant-name=${authConfig.tenant}&token=Bearer%20${encodeURIComponent(token)}`;
    },
    [authConfig],
  );

  // For transcribe endpoint (direct connection)
  const buildTranscribeWebSocketUrl = useCallback(
    (token: string): string => {
      if (!authConfig || !authConfig.wsBaseUrl || !authConfig.tenant) {
        throw new Error("Invalid auth configuration for WebSocket URL");
      }
      return `${authConfig.wsBaseUrl}/transcribe?token=Bearer%20${encodeURIComponent(token)}&tenant-name=${authConfig.tenant}`;
    },
    [authConfig],
  );

  const clearInteraction = useCallback(() => {
    setAuthStatus((prev) => ({ ...prev, interaction: undefined }));
  }, []);

  return useMemo(
    () => ({
      authConfig,
      updateAuthConfig,
      authStatus,
      currentPreset,
      loadPreset,
      clearAuth,
      authenticate,
      authenticateForTranscribe,
      createInteraction,
      clearInteraction,
      buildWebSocketUrl,
      buildTranscribeWebSocketUrl,

      availablePresets: ["custom"] as EnvPreset[],

      // The server owns credentials; "configured" means /api/config succeeded.
      isUsingEnvVars: isServerConfigured,
      debugMode: import.meta.env.VITE_DEBUG === "true",

      // Computed properties
      isReady: authStatus.step === "ready" && !!authConfig.authToken,
      isReadyForStream:
        authStatus.step === "ready" && !!authConfig.authToken && !!authStatus.interaction,
      isLoading: authStatus.isLoading,
      // Can authenticate if server has env creds OR user has filled in all fields
      canAuthenticate:
        isServerConfigured ||
        !!(
          authConfig.clientId &&
          authConfig.clientSecret &&
          authConfig.cluster &&
          authConfig.tenant
        ),
    }),
    [
      authConfig,
      updateAuthConfig,
      authStatus,
      currentPreset,
      loadPreset,
      clearAuth,
      authenticate,
      authenticateForTranscribe,
      createInteraction,
      clearInteraction,
      buildWebSocketUrl,
      buildTranscribeWebSocketUrl,
      isServerConfigured,
    ],
  );
}
