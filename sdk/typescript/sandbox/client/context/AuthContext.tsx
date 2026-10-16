import { createContext, type ReactNode, useContext, useEffect, useMemo } from "react";
import { AppletAuthProvider } from "../applets/_shared/authContext";
import { useCortiAuth } from "../hooks/useCortiAuth";

type AuthContextValue = ReturnType<typeof useCortiAuth>;

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds a single useCortiAuth instance for the whole app. Mounted above the
 * router so the auth token (kept in-memory by the hook) survives navigation
 * between endpoint pages — pages reset their own session state, but auth does
 * not need to be re-run on every hop.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useCortiAuth();
  const { authConfig, authenticate, canAuthenticate, isReady, isUsingEnvVars } = auth;

  // Auto-authenticate only when the server holds credentials via env vars.
  // When the user needs to enter their own credentials, let them click the
  // Authenticate button — auto-firing would call stream-token with no creds.
  useEffect(() => {
    if (isUsingEnvVars && canAuthenticate && !authConfig.authToken) {
      authenticate().catch((error) => {
        console.warn("Auto-authentication failed:", error);
      });
    }
  }, [isUsingEnvVars, canAuthenticate, authConfig.authToken, authenticate]);

  const appletAuthValue = useMemo(
    () => ({
      authConfig: {
        authToken: authConfig.authToken || "",
        cluster: authConfig.cluster,
        tenant: authConfig.tenant,
        clientId: authConfig.clientId,
      },
      authenticate,
      isReady,
    }),
    [
      authConfig.authToken,
      authConfig.cluster,
      authConfig.tenant,
      authConfig.clientId,
      authenticate,
      isReady,
    ],
  );

  return (
    <AuthContext.Provider value={auth}>
      <AppletAuthProvider value={appletAuthValue}>{children}</AppletAuthProvider>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
