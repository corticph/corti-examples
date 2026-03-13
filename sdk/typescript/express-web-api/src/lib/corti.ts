import { Corti, CortiAuth, CortiClient, CortiEnvironment, CortiError } from "@corti/sdk";
import type { Response } from "express";

export const cortiEnvironment = process.env.CORTI_ENVIRONMENT ?? "eu";

/** Re-export SDK types and client so routes can import from one place. */
export { Corti, CortiAuth, CortiClient, CortiEnvironment, CortiError };

/**
 * Create SDK CortiAuth instance (environment + tenant only; pass credentials to getToken).
 * Use cortiAuth.getToken({ clientId, clientSecret, scopes }) to obtain tokens.
 */
export function createCortiAuth(): CortiAuth | null {
  const config = getCortiConfig();

  if (!config) {
    return null;
  }

  return new CortiAuth({
    tenantName: config.tenantName,
    environment: config.environment,
  });
}

export function getCortiConfig(): {
  tenantName: string;
  clientId: string;
  clientSecret: string;
  environment: string;
} | null {
  const tenantName = process.env.CORTI_TENANT_NAME ?? process.env.CORTI__TENANTNAME;
  const clientId = process.env.CORTI_CLIENT_ID ?? process.env.CORTI__CLIENTID;
  const clientSecret = process.env.CORTI_CLIENT_SECRET ?? process.env.CORTI__CLIENTSECRET;

  if (!tenantName || !clientId || !clientSecret) {
    return null;
  }

  return {
    tenantName,
    clientId,
    clientSecret,
    environment: cortiEnvironment,
  };
}

/** PKCE: dedicated tenantName + clientId + redirectUri + environment (no secret). Uses CORTI_PKCE_* when set, falls back to shared CORTI_* variables. */
export function getPkceConfig(): {
  tenantName: string;
  clientId: string;
  redirectUri: string;
  environment: string;
} | null {
  const tenantName =
    process.env.CORTI_PKCE_TENANT_NAME ??
    process.env.CORTI__PKCETENANTNAME ??
    process.env.CORTI_TENANT_NAME ??
    process.env.CORTI__TENANTNAME;
  const clientId = process.env.CORTI_PKCE_CLIENT_ID ?? process.env.CORTI__PKCECLIENTID;
  const redirectUri = process.env.CORTI_PKCE_REDIRECT_URI ?? process.env.CORTI__PKCEREDIRECTURI;
  const environment =
    process.env.CORTI_PKCE_ENVIRONMENT ??
    process.env.CORTI__PKCEENVIRONMENT ??
    cortiEnvironment;

  if (!tenantName || !clientId || !redirectUri) {
    return null;
  }

  return { tenantName, clientId, redirectUri, environment };
}

/** Send 400 when PKCE config (tenant, clientId, redirectUri) is missing. */
export function sendPkceConfigError(res: Response): boolean {
  const config = getPkceConfig();

  if (config) {
    return false;
  }

  res.status(400).json({
    error:
      "PKCE credentials required. Set CORTI_PKCE_CLIENT_ID, CORTI_PKCE_REDIRECT_URI, and CORTI_PKCE_TENANT_NAME (or CORTI_TENANT_NAME as fallback) in .env.local or environment.",
  });

  return true;
}

/** Authorization code: dedicated tenantName + clientId + clientSecret + redirectUri + environment. Uses CORTI_AUTH_CODE_* when set, falls back to shared CORTI_* variables. */
export function getAuthCodeConfig(): {
  tenantName: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: string;
} | null {
  const tenantName =
    process.env.CORTI_AUTH_CODE_TENANT_NAME ??
    process.env.CORTI__AUTHCODETENANTNAME ??
    process.env.CORTI_TENANT_NAME ??
    process.env.CORTI__TENANTNAME;
  const clientId = process.env.CORTI_AUTH_CODE_CLIENT_ID ?? process.env.CORTI__AUTHCODECLIENTID;
  const clientSecret = process.env.CORTI_AUTH_CODE_CLIENT_SECRET ?? process.env.CORTI__AUTHCODECLIENTSECRET;
  const redirectUri = process.env.CORTI_AUTH_CODE_REDIRECT_URI ?? process.env.CORTI__AUTHCODEREDIRECTURI;
  const environment =
    process.env.CORTI_AUTH_CODE_ENVIRONMENT ??
    process.env.CORTI__AUTHCODEENVIRONMENT ??
    cortiEnvironment;

  if (!tenantName || !clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return {
    tenantName,
    clientId,
    clientSecret,
    redirectUri,
    environment,
  };
}


/** ROPC (resource owner password credentials): tenant + clientId + username + password. Uses CORTI_ROPC_CLIENT_ID when set, else CORTI_CLIENT_ID. */
export function getRopcConfig(): {
  tenantName: string;
  clientId: string;
  username: string;
  password: string;
  environment: string;
} | null {
  const tenantName = process.env.CORTI_TENANT_NAME ?? process.env.CORTI__TENANTNAME;
  const clientId =
    process.env.CORTI_ROPC_CLIENT_ID ??
    process.env.CORTI__ROPCCLIENTID ??
    process.env.CORTI_CLIENT_ID ??
    process.env.CORTI__CLIENTID;
  const username = process.env.CORTI_USERNAME ?? process.env.CORTI__USERNAME;
  const password = process.env.CORTI_PASSWORD ?? process.env.CORTI__PASSWORD;

  if (!tenantName || !clientId || !username || !password) {
    return null;
  }

  return {
    tenantName,
    clientId,
    username,
    password,
    environment: cortiEnvironment,
  };
}

export function createCortiClient(): {
  client: CortiClient | null;
  error: Response | null;
} {
  const config = getCortiConfig();

  if (!config) {
    return {
      client: null,
      error: null,
    };
  }

  const client = new CortiClient({
    tenantName: config.tenantName,
    environment: config.environment,
    auth: { clientId: config.clientId, clientSecret: config.clientSecret },
  });

  return { client, error: null };
}

/** Create CortiClient with ROPC auth (clientId + username + password). Requires getRopcConfig(). */
export function createCortiClientRopc(): {
  client: CortiClient | null;
  error: Response | null;
} {
  const config = getRopcConfig();

  if (!config) {
    return { client: null, error: null };
  }

  const client = new CortiClient({
    tenantName: config.tenantName,
    environment: config.environment,
    auth: {
      clientId: config.clientId,
      username: config.username,
      password: config.password,
    },
  });

  return { client, error: null };
}

export function sendCortiConfigError(res: Response): boolean {
  const config = getCortiConfig();

  if (config) {
    return false;
  }

  res.status(400).json({
    error:
      "Corti credentials required. Set CORTI_TENANT_NAME, CORTI_CLIENT_ID, CORTI_CLIENT_SECRET (or CORTI__TENANTNAME, CORTI__CLIENTID, CORTI__CLIENTSECRET) in .env.local or environment.",
  });

  return true;
}

/** Send 400 when auth code config (tenant, clientId, clientSecret, redirectUri) is missing. */
export function sendAuthCodeConfigError(res: Response): boolean {
  const config = getAuthCodeConfig();

  if (config) {
    return false;
  }

  res.status(400).json({
    error:
      "Auth code credentials required. Set CORTI_AUTH_CODE_CLIENT_ID, CORTI_AUTH_CODE_CLIENT_SECRET, CORTI_AUTH_CODE_REDIRECT_URI, and CORTI_AUTH_CODE_TENANT_NAME (or CORTI_TENANT_NAME as fallback) in .env.local or environment.",
  });

  return true;
}

/** Send 400 when ROPC config (tenant, clientId, username, password) is missing. */
export function sendRopcConfigError(res: Response): boolean {
  const config = getRopcConfig();

  if (config) {
    return false;
  }

  res.status(400).json({
    error:
      "ROPC credentials required. Set CORTI_TENANT_NAME, CORTI_CLIENT_ID (or CORTI_ROPC_CLIENT_ID), CORTI_USERNAME, CORTI_PASSWORD (or CORTI__TENANTNAME, CORTI__CLIENTID/CORTI__ROPCCLIENTID, CORTI__USERNAME, CORTI__PASSWORD) in .env.local or environment.",
  });

  return true;
}

export function cortiErrorResponse(error: unknown, res: Response): void {
  if (error instanceof CortiError) {
    res.status(error.statusCode ?? 500).json({
      error: error.message,
      statusCode: error.statusCode,
      body: error.body,
    });

    return;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : String(error);

  res.status(500).json({ error: message || "Internal server error" });
}
