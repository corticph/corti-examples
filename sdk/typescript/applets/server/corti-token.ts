import axios from "axios";

export interface CortiCreds {
  clientId: string;
  clientSecret: string;
  cluster: string;
  tenant: string;
}

const SAFE_IDENTIFIER = /^[a-z0-9-]+$/;

let credsCache: CortiCreds | null = null;

export function getCreds(): CortiCreds {
  if (credsCache) return credsCache;

  const env = process.env;
  const creds: Partial<CortiCreds> = {
    clientId: env.CORTI_CLIENT_ID,
    clientSecret: env.CORTI_CLIENT_SECRET,
    cluster: env.CORTI_CLUSTER ?? "dev-weu",
    tenant: env.CORTI_TENANT,
  };

  if (!creds.clientId || !creds.clientSecret || !creds.tenant) {
    throw new Error(
      "Missing Corti credentials: set CORTI_CLIENT_ID, CORTI_CLIENT_SECRET, and CORTI_TENANT in .env",
    );
  }
  if (
    !SAFE_IDENTIFIER.test(creds.cluster!) ||
    !SAFE_IDENTIFIER.test(creds.tenant)
  ) {
    throw new Error(
      "Invalid CORTI_CLUSTER or CORTI_TENANT: must match ^[a-z0-9-]+$",
    );
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

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

async function mint(scope: string): Promise<TokenResponse> {
  const { clientId, clientSecret, cluster, tenant } = getCreds();
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

let fullScope: { token: string; expMs: number } | null = null;

export async function getFullScopeToken(): Promise<string> {
  if (fullScope && Date.now() < fullScope.expMs - 30_000)
    return fullScope.token;
  const data = await mint("openid");
  fullScope = {
    token: data.access_token,
    expMs: Date.now() + data.expires_in * 1000,
  };
  return fullScope.token;
}

export type StreamScope = "transcribe" | "streams";

export async function getScopedToken(
  scopes: StreamScope[],
): Promise<TokenResponse> {
  const scope = ["openid", ...scopes].join(" ");
  return mint(scope);
}
