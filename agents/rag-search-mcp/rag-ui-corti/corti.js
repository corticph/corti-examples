import { CortiClient } from '@corti/sdk'
import { CORTI } from './config.js'

// The Corti API connection. Single-session: one client for the running process,
// established by /api/auth and read by the guarded routes.
let client = null

export function getCorti() {
  return client
}

export async function connect() {
  const cortiClient = new CortiClient({
    environment: CORTI.env,
    tenantName: CORTI.tenant,
    auth: { clientId: CORTI.clientId, clientSecret: CORTI.clientSecret },
  })
  await cortiClient.getAuthHeaders()
  client = cortiClient
}

// Express middleware: block routes that need an authenticated Corti client.
// Returns 401 so the frontend resets to the connect screen.
export function requireCorti(req, res, next) {
  if (!client) return res.status(401).json({ error: 'Session expired, please reconnect' })
  next()
}

export function sdkStatus(err) {
  if (err.statusCode != null) return err.statusCode
  if (err.name === 'CortiTimeoutError') return 408
  return 500
}

// Determines best user-facing message from a Corti SDK error.
function deriveUserErrorMessage(err) {
  const body = err.body
  if (body && typeof body === 'object') {
    if (body.error_description) return body.error_description
    if (body.error) return body.error
    if (body.message) return body.message
  }
  if (typeof body === 'string' && body.length > 0) return body
  const wwwAuth = err.rawResponse?.headers?.get?.('www-authenticate')
  if (wwwAuth) {
    const description = wwwAuth.match(/error_description="([^"]+)"/)?.[1]
    if (description) return description
    const code = wwwAuth.match(/error="([^"]+)"/)?.[1]
    if (code) return code
  }
  if (err.statusCode != null) return `Request failed: ${err.statusCode}`
  if (err.name === 'CortiTimeoutError') return err.message
  return `Corti API unreachable: ${err.message || 'unknown error'}`
}

export function sdkError(err) {
  console.error(`[SDK Error] ${err.name}: ${err.message}`)
  return { error: deriveUserErrorMessage(err) }
}
