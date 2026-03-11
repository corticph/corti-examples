import { Corti, CortiAuth, CortiClient, CortiEnvironment, CortiError } from "@corti/sdk";
import type { Response } from "express";

const env = process.env.CORTI_ENVIRONMENT?.toLowerCase();

export const cortiEnvironment = env === "eu" ? CortiEnvironment.Eu : CortiEnvironment.Us;

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
  environment: typeof cortiEnvironment;
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
