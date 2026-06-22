import 'dotenv/config'

// Owner config (env). Required values have no default — fail fast if missing
// rather than starting with a silent fallback that would create a misconfigured
// agent. All process.env reading lives here.
const required = ['MCP_URL', 'MCP_NAME', 'SYSTEM_PROMPT']
const missing = required.filter((k) => !process.env[k])
if (missing.length) {
  console.error(`[config] Missing required env var(s): ${missing.join(', ')}. See .env.example.`)
  process.exit(1)
}

export const MCP_URL = process.env.MCP_URL
export const MCP_NAME = process.env.MCP_NAME
export const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT
export const MCP_AUDIENCE = 'search-documents-mcp' // must match the MCP's audience

// The MCP's other endpoints live on the same host as /mcp.
export const INGEST_URL = MCP_URL.replace(/\/mcp\/?$/, '/ingest')
export const BIND_URL = MCP_URL.replace(/\/mcp\/?$/, '/bind-context')

export const MCP_SERVER_CONFIG = {
  name: MCP_NAME,
  transportType: 'streamable_http',
  authorizationType: 'bearer',
  url: MCP_URL,
}

export const CORTI = {
  env: process.env.VITE_CORTI_ENV || 'us',
  tenant: process.env.VITE_CORTI_TENANT || 'base',
  clientId: process.env.VITE_CORTI_CLIENT_ID || '',
  clientSecret: process.env.VITE_CORTI_CLIENT_SECRET || '',
}

export const PORT = 3003
