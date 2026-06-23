import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { requireCorti, getCorti, sdkStatus, sdkError } from '../corti.js'
import { BIND_URL } from '../config.js'
import { mintScopeToken } from '../mcp.js'
import { getClinician, getActiveMcpName } from '../session.js'

const router = Router()

// Start chat: a throwaway message creates the conversation's context; we grab
// its id and pre-bind the clinician's scope on the MCP, so the first real
// question is already scoped without relying on Corti's nondeterministic
// first-turn authenticated tool call.
router.post('/chat/start', requireCorti, async (req, res) => {
  const clinician = getClinician()
  if (!clinician) return res.status(400).json({ error: 'Sign in as a clinician first.' })
  const { agentId } = req.body ?? {}
  if (!agentId) return res.status(400).json({ error: 'agentId is required.' })
  try {
    const warmup = {
      role: 'user',
      parts: [{ kind: 'text', text: 'Initializing session.' }],
      messageId: randomUUID(),
      kind: 'message',
    }
    const result = await getCorti().agents.messageSend(
      agentId,
      { message: warmup, configuration: { blocking: false } },
      { timeoutInSeconds: 60, maxRetries: 0 },
    )
    const contextId = result?.task?.contextId ?? result?.message?.contextId
    if (!contextId) return res.status(502).json({ error: 'Could not obtain a context id from Corti.' })

    const token = mintScopeToken(clinician)
    const bindResponse = await fetch(BIND_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ contextId }),
    })
    if (!bindResponse.ok) {
      const body = await bindResponse.json().catch(() => ({}))
      return res.status(502).json({ error: body.error || `Pre-bind failed: ${bindResponse.status}` })
    }
    console.log(`[chat] started context ${contextId} pre-bound for ${clinician.id}`)
    res.json({ contextId })
  } catch (err) {
    res.status(sdkStatus(err)).json(sdkError(err))
  }
})

// Poll a task to completion (the frontend drives this).
router.get('/agents/:id/task/:taskId', requireCorti, async (req, res) => {
  try {
    const task = await getCorti().agents.getTask(req.params.id, req.params.taskId)
    res.json(task)
  } catch (err) {
    res.status(sdkStatus(err)).json(sdkError(err))
  }
})

// Send a message, attaching the clinician's scope token as a DataPart so the MCP
// scopes retrieval to their patient panel.
router.post('/agents/:id/message', requireCorti, async (req, res) => {
  try {
    const { text, files, contextId, taskId } = req.body
    const parts = []
    if (typeof text === 'string' && text.length > 0) parts.push({ kind: 'text', text })
    if (Array.isArray(files)) {
      for (const file of files) {
        parts.push({ kind: 'file', file: { name: file.name, mimeType: file.mimeType, bytes: file.bytes } })
      }
    }
    const clinician = getClinician()
    if (clinician) {
      parts.push({ kind: 'data', data: { type: 'token', mcp_name: getActiveMcpName(), token: mintScopeToken(clinician) } })
    }
    const message = { role: 'user', parts, messageId: randomUUID(), kind: 'message' }
    if (contextId) message.contextId = contextId
    if (taskId) message.taskId = taskId
    const result = await getCorti().agents.messageSend(
      req.params.id,
      { message, configuration: { blocking: false } },
      { timeoutInSeconds: 60, maxRetries: 0 },
    )
    res.json(result)
  } catch (err) {
    res.status(sdkStatus(err)).json(sdkError(err))
  }
})

export default router
