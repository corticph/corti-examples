import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { requireCorti } from '../corti.js'
import { INGEST_URL } from '../config.js'
import { getClinician } from '../session.js'
import { PATIENTS } from '../directory.js'

const router = Router()

// Upload a document into the MCP index, scoped to a patient or "shared".
router.post('/documents', requireCorti, async (req, res) => {
  const clinician = getClinician()
  if (!clinician) return res.status(400).json({ error: 'Sign in as a clinician first.' })
  const { scope, text } = req.body ?? {}
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Document text is required.' })
  }

  // Authorize the chosen scope against the clinician's panel — never trust the
  // browser's scope. For patient docs, prepend an identifier header so the
  // name/MRN stay searchable.
  let resolvedScope
  let docText = text
  if (scope === 'shared') {
    resolvedScope = 'shared'
  } else if (typeof scope === 'string' && scope.startsWith('patient:')) {
    const mrn = scope.slice('patient:'.length)
    if (!clinician.patients.includes(mrn)) {
      return res.status(403).json({ error: 'You do not have access to that patient.' })
    }
    resolvedScope = `patient:${mrn}`
    const name = PATIENTS[mrn] ?? mrn
    docText = `Patient: ${name} (${mrn})\n\n${text}`
  } else {
    return res.status(400).json({ error: 'Invalid scope.' })
  }

  // Auto-generate a unique title/source so uploads never silently overwrite.
  const source = `upload-${Date.now()}-${randomUUID().slice(0, 8)}`

  try {
    const r = await fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source, text: docText, scope: resolvedScope }),
    })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(502).json({ error: body.error || `MCP ingest failed: ${r.status}` })
    console.log(`[upload] clinician=${clinician.id} scope=${resolvedScope} source=${source} chunks=${body.chunks}`)
    res.json({ ok: true, source, scope: resolvedScope, chunks: body.chunks })
  } catch (err) {
    res.status(502).json({ error: `Could not reach the MCP ingest endpoint: ${err.message}` })
  }
})

export default router
