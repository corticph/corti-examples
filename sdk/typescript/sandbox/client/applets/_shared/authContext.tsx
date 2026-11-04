/**
 * Auth seam for applets. Defines the interface and React context that all
 * applets depend on for authentication.
 *
 * HOST APP INTEGRATION:
 * Wrap your app (or the subtree that mounts applets) with AppletAuthProvider
 * and supply a value that matches AppletAuthContextValue:
 *
 *   <AppletAuthProvider value={{ authConfig, authenticate, isReady }}>
 *     <YourAppletMount />
 *   </AppletAuthProvider>
 *
 * - authConfig.authToken  — current bearer token (empty string when not yet ready)
 * - authConfig.cluster    — Corti cluster id (e.g. "dev-weu", "prod-eun")
 * - authConfig.tenant     — Keycloak realm / tenant name
 * - authConfig.clientId   — OAuth client id (used to namespace per-client storage)
 * - authenticate()        — returns a fresh bearer token string (Promise<string>)
 * - isReady               — true once a token is available and the app can connect
 */

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

export interface AppletAuthConfig {
  authToken: string;
  cluster: string;
  tenant: string;
  clientId: string;
}

export interface AppletAuthContextValue {
  authConfig: AppletAuthConfig;
  authenticate: () => Promise<string>;
  isReady: boolean;
}

const AppletAuthContext = createContext<AppletAuthContextValue | null>(null);

export function AppletAuthProvider({
  value,
  children,
}: {
  value: AppletAuthContextValue;
  children: ReactNode;
}) {
  return <AppletAuthContext.Provider value={value}>{children}</AppletAuthContext.Provider>;
}

export function useAuth(): AppletAuthContextValue {
  const ctx = useContext(AppletAuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AppletAuthProvider");
  }
  return ctx;
}
