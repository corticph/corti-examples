import { CortiClient } from "@corti/sdk";
import type { NextFunction, Request, Response } from "express";
import { CORTI } from "./config.js";

// The Corti API connection. Single-session: one client for the running process,
// established by /api/auth and read by the guarded routes.
let client: CortiClient | null = null;

export function getCorti(): CortiClient {
  if (!client) {
    throw new Error("Corti client is not connected. Call connect() first.");
  }
  return client;
}

export async function connect(): Promise<void> {
  const cortiClient = new CortiClient({
    environment: CORTI.env,
    tenantName: CORTI.tenant,
    auth: { clientId: CORTI.clientId, clientSecret: CORTI.clientSecret },
    analytics: { examples_repo: "agents/react/search-documents-ui" },
  });
  await cortiClient.getAuthHeaders();
  client = cortiClient;
}

// Express middleware: block routes that need an authenticated Corti client.
// Returns 401 so the frontend resets to the connect screen.
export function requireCorti(_req: Request, res: Response, next: NextFunction): void {
  if (!client) {
    res.status(401).json({ error: "Session expired, please reconnect" });
    return;
  }
  next();
}

// Duck-typed shape of a Corti SDK error — we read a few fields defensively.
interface SdkErrorShape {
  statusCode?: number;
  name?: string;
  message?: string;
  body?: { error_description?: string; error?: string; message?: string } | string;
  rawResponse?: { headers?: { get?: (name: string) => string | null } };
}

export function sdkStatus(err: unknown): number {
  const e = err as SdkErrorShape;
  if (e.statusCode != null) {
    return e.statusCode;
  }
  if (e.name === "CortiTimeoutError") {
    return 408;
  }
  return 500;
}

// Determines best user-facing message from a Corti SDK error.
function deriveUserErrorMessage(err: unknown): string {
  const e = err as SdkErrorShape;
  const body = e.body;
  if (body && typeof body === "object") {
    if (body.error_description) {
      return body.error_description;
    }
    if (body.error) {
      return body.error;
    }
    if (body.message) {
      return body.message;
    }
  }
  if (typeof body === "string" && body.length > 0) {
    return body;
  }
  const wwwAuth = e.rawResponse?.headers?.get?.("www-authenticate");
  if (wwwAuth) {
    const description = wwwAuth.match(/error_description="([^"]+)"/)?.[1];
    if (description) {
      return description;
    }
    const code = wwwAuth.match(/error="([^"]+)"/)?.[1];
    if (code) {
      return code;
    }
  }
  if (e.statusCode != null) {
    return `Request failed: ${e.statusCode}`;
  }
  if (e.name === "CortiTimeoutError") {
    return e.message ?? "Request timed out";
  }
  return `Corti API unreachable: ${e.message || "unknown error"}`;
}

export function sdkError(err: unknown): { error: string } {
  const e = err as SdkErrorShape;
  console.error(`[SDK Error] ${e.name}: ${e.message}`);
  return { error: deriveUserErrorMessage(err) };
}
