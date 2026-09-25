import { CortiClient, CortiError } from "@corti/sdk";
import type { Config } from "./env.js";

/**
 * Creates an authenticated CortiClient. Passing clientId/clientSecret (rather than a raw
 * access token) tells the SDK to fetch and transparently refresh OAuth tokens itself —
 * there is no separate "get a token" step to perform before calling the API.
 */
export function createClient(config: Config): CortiClient {
  return new CortiClient({
    tenantName: config.tenantName,
    environment: config.environment,
    auth: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    },
  });
}

export function describeError(error: unknown): string {
  if (error instanceof CortiError) {
    return `Corti API error (${error.statusCode ?? "?"}): ${error.message}`;
  }

  return error instanceof Error ? error.message : String(error);
}
