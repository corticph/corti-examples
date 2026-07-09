import type { Corti } from "@corti/sdk";
import { MCP_AUDIENCE } from "./config.js";
import { type Clinician, PATIENTS } from "./directory.js";
import { signScopeToken } from "./token.js";

// Mint a short-lived signed token granting the clinician's patient panel as
// scopes (MRN -> "patient:<MRN>"), with display names so the MCP can label
// passages by patient. The MCP verifies this and filters retrieval.
export function mintScopeToken(clinician: Clinician): string {
  const scopes = clinician.patients.map((mrn) => `patient:${mrn}`);
  const names: Record<string, string> = {};
  for (const mrn of clinician.patients) names[`patient:${mrn}`] = PATIENTS[mrn] ?? mrn;
  return signScopeToken({ sub: clinician.id, scopes, names, aud: MCP_AUDIENCE });
}

// ── Agent detection by MCP URL (name-agnostic). ───────────────────────────────

// Only the fields we read off an MCP server entry to detect a wired URL.
interface McpServerRef {
  name?: string;
  url?: string;
}

function normalizeUrl(url?: string): string {
  return String(url || "")
    .trim()
    .toLowerCase()
    .replace(/\/+$/, "");
}

// The agent's MCP server (agent-level or expert-level) wired to the target URL,
// or null. We read its `name` so the scope-token DataPart's mcp_name matches.
export function matchedMcpServer(
  agent: Corti.AgentsAgentResponse,
  targetUrl: string,
): McpServerRef | null {
  const target = normalizeUrl(targetUrl);
  if (!target) return null;
  // AgentsAgentResponse is a union whose variants expose different fields; read
  // the MCP-server fields defensively (agent-level and expert-level).
  const a = agent as unknown as {
    mcpServers?: McpServerRef[];
    experts?: { mcpServers?: McpServerRef[] }[];
  };
  const expertServers = (a.experts ?? []).flatMap((expert) => expert.mcpServers ?? []);
  const servers: McpServerRef[] = [...(a.mcpServers ?? []), ...expertServers];
  return servers.find((server) => normalizeUrl(server.url) === target) ?? null;
}

export function agentUsesMcp(agent: Corti.AgentsAgentResponse, targetUrl: string): boolean {
  return matchedMcpServer(agent, targetUrl) != null;
}
