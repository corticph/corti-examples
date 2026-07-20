import { useCallback, useEffect, useRef, useState } from "react";

interface ServerConfig {
  cluster: string;
  tenant: string;
  clientId: string;
}

export interface CortiAuthState {
  authConfig: {
    authToken: string;
    cluster: string;
    tenant: string;
    clientId: string;
  };
  authenticate: () => Promise<string>;
  isReady: boolean;
  isConfigured: boolean;
  error: string | undefined;
}

export function useCortiAuth(): CortiAuthState {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [authToken, setAuthToken] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => {
        if (!r.ok) {
          throw new Error(
            `Server responded ${r.status} — is the dev server running and CORTI_* env vars set?`,
          );
        }
        return r.json() as Promise<ServerConfig>;
      })
      .then(setConfig)
      .catch((e: Error) => setError(e.message));
  }, []);

  const authenticate = useCallback(async (): Promise<string> => {
    setError(undefined);
    const response = await fetch("/api/auth/stream-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopes: ["transcribe", "streams"] }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || `Auth failed: ${response.status}`);
    }
    const { accessToken, expiresIn } = await response.json();
    setAuthToken(accessToken);
    setIsReady(true);

    // Proactively refresh ~30s before the token expires.
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    if (expiresIn && expiresIn > 30) {
      refreshTimerRef.current = setTimeout(
        () => {
          authenticate().catch(console.error);
        },
        (expiresIn - 30) * 1000,
      );
    }

    return accessToken;
  }, []);

  useEffect(() => {
    if (config) {
      authenticate().catch((e: Error) => setError(e.message));
    }
  }, [config, authenticate]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  return {
    authConfig: {
      authToken,
      cluster: config?.cluster ?? "",
      tenant: config?.tenant ?? "",
      clientId: config?.clientId ?? "",
    },
    authenticate,
    isReady,
    isConfigured: !!config,
    error,
  };
}
