# Security checklist — example contribution

Rubric for reviewing a contributed example in `corticph/sdk-typescript-examples`. Scope to the PR/branch diff. Report each finding with severity, file:line, why it matters, and the fix.

## Credential exposure (highest priority)

- No Corti credentials committed: `CORTI_CLIENT_ID`, `CORTI_CLIENT_SECRET`, tenant names, passwords, API tokens, or bearer tokens with real values in any tracked file.
- `.env.example` (and any sample/config) contains **placeholders only** (`your-client-id`), never real secrets. No real `.env` in the diff; real `.env` must be gitignored.
- No secret shipped to the browser: secrets must not appear in client-side code, bundles, or public env vars (`VITE_*`, `NEXT_PUBLIC_*`, `REACT_APP_*` holding a client secret/token).

## Browser → Corti pattern

- The browser must **not** call Corti APIs directly with client credentials. Correct pattern: a server-side proxy authenticates with Corti and the browser talks to the proxy. See `proxy/` and the root README "Proxy" note.
- Short-lived tokens minted server-side and passed to the browser are acceptable; long-lived client secrets in the browser are not.

## Other issues

- No secrets/PHI written to logs or console in a way that would leak in production.
- CORS not wildcard-open (`*`) when credentials/cookies are involved.
- No obviously dangerous patterns: `eval` on untrusted input, disabled TLS verification, hardcoded internal URLs/keys.
- Dependencies come from expected registries; no suspicious postinstall scripts added.

## Output format

For each finding:
- **Severity**: blocker / warning / nit
- **File:line**
- **Why it matters** (assume a non-expert author)
- **How to fix**, with a path to a compliant existing example when possible
