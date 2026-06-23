import { signScopeToken } from './token.mjs'
import { MCP_AUDIENCE } from './config.js'
import { PATIENTS } from './directory.js'

// Mint a short-lived signed token granting the clinician's patient panel as
// scopes (MRN -> "patient:<MRN>"), with display names so the MCP can label
// passages by patient. The MCP verifies this and filters retrieval.
export function mintScopeToken(clinician) {
  const scopes = clinician.patients.map((mrn) => `patient:${mrn}`)
  const names = {}
  for (const mrn of clinician.patients) names[`patient:${mrn}`] = PATIENTS[mrn] ?? mrn
  return signScopeToken({ sub: clinician.id, scopes, names, aud: MCP_AUDIENCE })
}

// ── Agent detection by MCP URL (name-agnostic). ───────────────────────────────
function normalizeUrl(url) {
  return String(url || '').trim().toLowerCase().replace(/\/+$/, '')
}

// The agent's MCP server (agent-level or expert-level) wired to the target URL,
// or null. We read its `name` so the scope-token DataPart's mcp_name matches.
export function matchedMcpServer(agent, targetUrl) {
  const target = normalizeUrl(targetUrl)
  if (!target) return null
  const servers = [
    ...(agent.mcpServers || []),
    ...((agent.experts || []).flatMap((expert) => expert.mcpServers || [])),
  ]
  return servers.find((server) => normalizeUrl(server.url) === target) ?? null
}

export function agentUsesMcp(agent, targetUrl) {
  return matchedMcpServer(agent, targetUrl) != null
}
