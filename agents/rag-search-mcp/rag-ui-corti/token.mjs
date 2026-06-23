import { createHmac } from 'node:crypto'

// Shared HMAC secret; must match the MCP verifier (search-documents-mcp/src/token.ts).
// Required with no default, so the app can never sign tokens with a guessable
// key. Production would more typically use asymmetric keys; HMAC keeps this demo
// dependency-free.
const SECRET = process.env.MCP_SCOPE_SECRET
if (!SECRET) {
  throw new Error('MCP_SCOPE_SECRET must be set (refusing to start with a default secret).')
}

const base64UrlJson = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const hmac = (data) => createHmac('sha256', SECRET).update(data).digest('base64url')

// This app only mints tokens (the MCP verifies them), so there is no verifier here.
// Sign a compact HS256 JWT.
export function signScopeToken(claims, ttlSeconds = 300, nowSeconds) {
  const now = nowSeconds ?? Math.floor(Date.now() / 1000)
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' })
  const payload = base64UrlJson({ ...claims, iat: now, exp: now + ttlSeconds })
  const data = `${header}.${payload}`
  return `${data}.${hmac(data)}`
}
