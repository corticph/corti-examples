import { CortiAuth } from "@corti/sdk";

export function getCortiServerConfig() {
  return {
    environment: process.env.CORTI_ENVIRONMENT!.trim(),
    tenantName: process.env.CORTI_TENANT_NAME!.trim(),
    clientId: process.env.CORTI_CLIENT_ID!.trim(),
    username: process.env.CORTI_USER_EMAIL!.trim(),
    password: process.env.CORTI_USER_PASSWORD!.trim(),
  };
}

export async function getCortiRopcToken() {
  const { environment, tenantName, clientId, username, password } = getCortiServerConfig();
  const auth = new CortiAuth({
    environment,
    tenantName,
  });

  return auth.getRopcFlowToken({
    clientId,
    username,
    password,
  });
}
