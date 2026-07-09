import "dotenv/config";
import type { Corti } from "@corti/sdk";

// Owner config (env). Required values have no default; fail fast if missing
// rather than starting with a silent fallback that would create a misconfigured
// agent. All process.env reading lives here.
const required = [
  "MCP_URL",
  "MCP_NAME",
  "SYSTEM_PROMPT",
  "CORTI_TENANT_NAME",
  "CORTI_CLIENT_ID",
  "CORTI_CLIENT_SECRET",
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`[config] Missing required env var(s): ${missing.join(", ")}. See .env.example.`);
  process.exit(1);
}

// Validated as present above, so the non-null assertions are safe.
export const MCP_URL: string = process.env.MCP_URL!;
export const MCP_NAME: string = process.env.MCP_NAME!;
export const SYSTEM_PROMPT: string = process.env.SYSTEM_PROMPT!;
export const MCP_AUDIENCE = "search-documents-mcp"; // must match the MCP's audience

// The MCP's other endpoints live on the same host as /mcp.
export const INGEST_URL = MCP_URL.replace(/\/mcp\/?$/, "/ingest");
export const BIND_URL = MCP_URL.replace(/\/mcp\/?$/, "/bind-context");

export const MCP_SERVER_CONFIG: Corti.AgentsCreateMcpServer = {
  name: MCP_NAME,
  transportType: "streamable_http",
  authorizationType: "bearer",
  url: MCP_URL,
};

export const CORTI = {
  env: process.env.CORTI_ENVIRONMENT || "us",
  tenant: process.env.CORTI_TENANT_NAME!,
  clientId: process.env.CORTI_CLIENT_ID!,
  clientSecret: process.env.CORTI_CLIENT_SECRET!,
};

export const PORT = 3003;
