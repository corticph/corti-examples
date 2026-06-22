import { Router } from 'express'
import { requireCorti, getCorti, sdkStatus, sdkError } from '../corti.js'
import { SYSTEM_PROMPT, MCP_SERVER_CONFIG, MCP_URL, MCP_NAME } from '../config.js'
import { agentUsesMcp, matchedMcpServer } from '../mcp.js'
import { setActiveMcpName } from '../session.js'

const router = Router()

// The config the setup screen confirms before creating the agent (public).
router.get('/agent/setup-config', (req, res) => {
  res.json({ systemPrompt: SYSTEM_PROMPT, mcpServer: MCP_SERVER_CONFIG, mcpConfigured: Boolean(MCP_URL) })
})

// Find an existing agent already wired to the configured MCP URL (any name).
router.get('/agent/active', requireCorti, async (req, res) => {
  try {
    const result = await getCorti().agents.list()
    const agents = Array.isArray(result) ? result : (result?.data ?? [])
    const match = agents.find((a) => agentUsesMcp(a, MCP_URL)) ?? null
    if (match) {
      // Use the reused agent's actual MCP server name for the token DataPart,
      // not the configured MCP_NAME (they can differ for a pre-existing agent).
      const name = matchedMcpServer(match, MCP_URL)?.name || MCP_NAME
      setActiveMcpName(name)
      console.log(`[agent] using existing "${match.name}" (mcp_name="${name}")`)
    }
    res.json({ agent: match, mcpConfigured: true })
  } catch (err) {
    res.status(sdkStatus(err)).json(sdkError(err))
  }
})

// Create the orchestrator wired to the configured MCP. Name is user-supplied.
router.post('/agent/provision', requireCorti, async (req, res) => {
  try {
    const name = (req.body?.name || '').trim() || 'Document Search Orchestrator'
    const agent = await getCorti().agents.create({
      name,
      description: 'Answers questions from scoped clinical documents via the Search Documents MCP.',
      systemPrompt: SYSTEM_PROMPT,
      mcpServers: [MCP_SERVER_CONFIG],
    })
    setActiveMcpName(MCP_NAME) // we created it with this server name
    console.log(`[agent] provisioned "${name}" wired to ${MCP_URL} (mcp_name="${MCP_NAME}")`)
    res.json(agent)
  } catch (err) {
    res.status(sdkStatus(err)).json(sdkError(err))
  }
})

export default router
