import { CortiAuth } from "@corti/sdk";

export interface CortiCreds {
  clientId: string;
  clientSecret: string;
  cluster: string;
  tenant: string;
}

const SAFE_IDENTIFIER = /^[a-z0-9-]+$/;

let credsCache: CortiCreds | null = null;

export function getCreds(): CortiCreds {
  if (credsCache) {
    return credsCache;
  }

  const env = process.env;
  const creds: Partial<CortiCreds> = {
    clientId: env.CORTI_CLIENT_ID,
    clientSecret: env.CORTI_CLIENT_SECRET,
    cluster: env.CORTI_ENVIRONMENT ?? "dev-weu",
    tenant: env.CORTI_TENANT_NAME,
  };

  if (!creds.clientId || !creds.clientSecret || !creds.tenant || !creds.cluster) {
    throw new Error(
      "Missing Corti credentials: set CORTI_CLIENT_ID, CORTI_CLIENT_SECRET, and CORTI_TENANT_NAME in .env",
    );
  }
  if (!SAFE_IDENTIFIER.test(creds.cluster) || !SAFE_IDENTIFIER.test(creds.tenant)) {
    throw new Error("Invalid CORTI_ENVIRONMENT or CORTI_TENANT_NAME: must match ^[a-z0-9-]+$");
  }

  credsCache = creds as CortiCreds;
  return credsCache;
}

export function hasCreds(): boolean {
  try {
    getCreds();
    return true;
  } catch {
    return false;
  }
}

function getAuth(): CortiAuth {
  const { cluster, tenant } = getCreds();
  return new CortiAuth({ environment: cluster, tenantName: tenant });
}

let fullScope: { token: string; expMs: number } | null = null;

export async function getFullScopeToken(): Promise<string> {
  if (fullScope && Date.now() < fullScope.expMs - 30_000) {
    return fullScope.token;
  }
  const { clientId, clientSecret } = getCreds();
  const data = await getAuth().getToken({ clientId, clientSecret });
  fullScope = {
    token: data.accessToken,
    expMs: Date.now() + data.expiresIn * 1000,
  };
  return fullScope.token;
}

export type StreamScope = "transcribe" | "streams";

export async function getScopedToken(
  scopes: StreamScope[],
): Promise<{ accessToken: string; expiresIn: number }> {
  const { clientId, clientSecret } = getCreds();
  const data = await getAuth().getToken({ clientId, clientSecret, scopes });
  return { accessToken: data.accessToken, expiresIn: data.expiresIn };
}
