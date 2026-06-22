// When the server returns 401 (session expired after restart), call this.
// App.jsx wires it up to reset auth state.
let _onUnauthorized = null
export function onUnauthorized(fn) { _onUnauthorized = fn }

// One fetch helper for every call: JSON-encodes the body, resets auth on 401,
// throws the server's error message on failure, and returns the parsed JSON.
async function request(path, { method = 'GET', body, label = 'Request' } = {}) {
  const init = { method }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const res = await fetch(path, init)
  if (res.status === 401) _onUnauthorized?.()
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `${label} failed: ${res.status}`)
  }
  return res.json()
}

// ── Connection + clinician ────────────────────────────────────────────────────
export const authenticate    = () => request('/api/auth', { method: 'POST', label: 'Auth' })
export const listClinicians  = () => request('/api/clinicians', { label: 'List clinicians' })
export const signInClinician = (clinicianId) =>
  request('/api/clinician/login', { method: 'POST', body: { clinicianId }, label: 'Clinician sign-in' })

// ── Agent setup ────────────────────────────────────────────────────────────────
export const getSetupConfig = () => request('/api/agent/setup-config', { label: 'Get setup config' })
export const getActiveAgent = () => request('/api/agent/active', { label: 'Agent lookup' })
export const provisionAgent = (name) =>
  request('/api/agent/provision', { method: 'POST', body: { name }, label: 'Provision agent' })

// ── Chat + documents ─────────────────────────────────────────────────────────
export const startChat = (agentId) =>
  request('/api/chat/start', { method: 'POST', body: { agentId }, label: 'Start chat' })
export const uploadDocument = ({ scope, text }) =>
  request('/api/documents', { method: 'POST', body: { scope, text }, label: 'Upload' })
export const getAgentTask = (agentId, taskId) =>
  request(`/api/agents/${encodeURIComponent(agentId)}/task/${encodeURIComponent(taskId)}`, { label: 'Get task' })

// Reads a File as base64 (FileReader gives "data:<mime>;base64,<payload>" — strip the prefix).
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => {
      const result = String(reader.result)
      const comma  = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

const TERMINAL_OK_STATES   = new Set(['completed'])
const TERMINAL_FAIL_STATES = new Set(['canceled', 'failed', 'rejected'])
// input-required: the agent paused to ask the user a follow-up — return the task
// so the chat can render the question and let the user reply. Not an error.
const FOLLOWUP_STATES      = new Set(['input-required'])
// auth-required is a genuine MCP auth problem, not a question — surface it.
const STUCK_STATES         = new Set(['auth-required'])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Poll a task to completion. Cadence: 2s for the first 30s, then 5s — responsive
// at the start, gentle for long-running agent reasoning.
async function pollAgentTask(agentId, taskId, { onTick } = {}) {
  const start = performance.now()
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const task    = await getAgentTask(agentId, taskId)
    const state   = task?.status?.state ?? 'unknown'
    const elapsed = Math.round((performance.now() - start) / 1000)
    onTick?.({ state, elapsed })

    if (TERMINAL_OK_STATES.has(state))   return task
    if (FOLLOWUP_STATES.has(state))      return task
    if (TERMINAL_FAIL_STATES.has(state)) throw new Error(`Agent task ${state}`)
    if (STUCK_STATES.has(state))         throw new Error(`Agent task requires authentication (${state})`)
    await sleep(elapsed < 30 ? 2000 : 5000)
  }
}

export async function sendAgentMessage(agentId, { text, files, contextId, taskId, onPoll }) {
  const encodedFiles = files && files.length
    ? await Promise.all(files.map(async (f) => ({
        name:     f.name,
        mimeType: f.type || 'application/octet-stream',
        bytes:    await readFileAsBase64(f),
      })))
    : undefined

  const initial = await request(`/api/agents/${encodeURIComponent(agentId)}/message`, {
    method: 'POST',
    body:   { text, files: encodedFiles, contextId, taskId },
    label:  'Send message',
  })

  // Non-blocking submit: the initial response usually has a task in
  // submitted/working state and no message yet. Poll until terminal.
  const initialTask  = initial?.task
  const initialState = initialTask?.status?.state
  if (initialTask?.id && !TERMINAL_OK_STATES.has(initialState) && !initial?.message?.parts) {
    onPoll?.({ state: initialState || 'submitted', elapsed: 0 })
    return { task: await pollAgentTask(agentId, initialTask.id, { onTick: onPoll }) }
  }
  return initial
}
