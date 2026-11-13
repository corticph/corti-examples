import type { CortiAccessToken } from "../_shared/useCortiAccessToken";

/** Transient authentication progress is not a connection/session change. */
export function nudgeConnectionState(
  connection: Pick<
    CortiAccessToken,
    "authConfig" | "environment" | "tenantName" | "clientId" | "isReady"
  >,
) {
  const available = Boolean(connection.authConfig.accessToken);
  return {
    available,
    scope: JSON.stringify([
      connection.environment,
      connection.tenantName,
      connection.clientId,
      available,
    ]),
  };
}
