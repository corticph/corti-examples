---
name: review-example-contribution
description: >-
  Review an external contribution (new example app) to this examples repo against
  repo conventions — linter setup, CI wiring, per-app docs and .env examples,
  @corti dependency versioning, root README linkage, category duplication,
  analytics tagging (examples_repo / x-corti-analytics), and security/credential
  exposure. Then create a PENDING (unsubmitted) GitHub review with explanatory
  comments. Use when the user gives a branch name or PR link and asks to review
  a contributed/new example, or invokes /review-example-contribution.
disable-model-invocation: true
---

# Review Example Contribution

Reviews a new example app contributed by someone else, then leaves a **pending** GitHub review (never auto-submitted). Many contributors are not deeply technical, so every comment must explain **why it matters**, **where to look**, and **how to fix it**, with a link/path to an existing example that already does it right.

Repo: `corticph/corti-examples` (may also appear as `corticph/sdk-typescript-examples` — use the repo the PR targets). Linter is **Biome** (TS) / **`dotnet format`** (C#). Reference example that follows every convention: `sdk/typescript/express-web-api/`.

## Workflow checklist

Copy and track:

```
- [ ] 0. Get freshest repo + check out the contribution; learn current structure
- [ ] 1. Resolve input (branch or PR link) -> PR number + changed files
- [ ] 1b. Re-review only: load prior review/comments; confirm earlier feedback was addressed or replied to
- [ ] 2. Linter set up for every new project
- [ ] 3. Linter/build wired into CI for every new project
- [ ] 4. Per-app docs: install/launch/test + credentials + .env example + var notation
- [ ] 5. @corti/* deps use current major (^3/^4) or `latest` — not stale pins like ^1.x
- [ ] 6. Root README links the new project in the right category with a description
- [ ] 7. Folder layout uses `{category}/{language}/{example-name}/`; path reflects stack; no duplicate category
- [ ] 8. Code quality: naming conventions, structure, consistency; prefer SDK over raw HTTP (read source, not just config)
- [ ] 8b. Analytics tagging: examples_repo / x-corti-analytics on every Corti REST/WS path
- [ ] 9. Security review (delegate to a subagent) — credential/secret exposure; no all-purpose Corti tokens in the frontend (scoped tokens only)
- [ ] 10. Compose comments and create a PENDING GitHub review (do NOT submit)
```

## Step 0 — Freshen and orient

```bash
git fetch origin --prune
```

Read the current layout so you know what already exists (do this every run — the repo changes):
- Root `README.md` — the "Use Cases" categories and per-category tables.
- Top-level category dirs: `embedded-assistant/`, `ambient/`, `dictation/`, `agents/`, `proxy/`, `sdk/`.
- `.github/workflows/sdk-examples-ci.yml` — how projects are wired into CI.
- `sdk/typescript/express-web-api/` — the reference project (Biome config, `.env.example`, README, `package.json`).

## Step 1 — Resolve the input

**PR link or number:**
```bash
gh pr view <num> --json number,headRefName,title,files
gh pr checkout <num>
gh pr diff <num>
```

**Branch name only** — check it out and find its PR (needed to post the review):
```bash
git checkout <branch> && git pull --ff-only
git diff origin/main...HEAD --stat        # what changed vs main
gh pr list --head <branch> --json number,title   # get PR number
```

If a branch has no open PR, do the review anyway and tell the user you cannot post a pending GitHub review without a PR — offer the findings inline instead.

Identify each **newly added project** (a new app directory with its own `package.json` or `.csproj`). The checks below apply per new project.

## Step 1b — Re-review prior feedback (when applicable)

If the PR already has review comments or a submitted review from an earlier round, treat this as a **re-review**: confirm the contributor responded to what was asked before filing new findings.

```bash
gh pr view <num> --json reviews,comments
gh api repos/corticph/sdk-typescript-examples/pulls/<num>/comments   # inline review comments
gh pr view <num> --comments                                             # issue-style PR comments
```

Use the repo slug from the PR target if it differs (`corticph/corti-examples` vs `corticph/sdk-typescript-examples`).

**Build a prior-feedback checklist** from:
- Submitted review summaries (`REQUEST_CHANGES`, `COMMENT`, `APPROVE`) and their inline threads
- Maintainer inline comments still open or without a clear fix
- Questions the contributor was asked to answer (in review body or threads)

**For each prior item, mark:**
- **Addressed** — verify in the current diff/code (don't take "fixed" comments at face value)
- **Partially addressed** — note what's still missing
- **Unaddressed** — carry forward as **Blocker** / **Should fix** (same severity as before unless context changed)
- **Answered in thread** — contributor explained why they didn't change something; judge whether the reason is acceptable (e.g. SDK gap, out of scope). If acceptable, don't re-raise; if not, say why in the new review.

**Do not** repeat resolved items or open duplicate inline comments on the same unchanged line unless the fix regressed or introduced a new problem. Focus new inline comments on **remaining** issues and **new** problems introduced since the last round.

**In the Step 10 review summary**, add a **Re-review** section before **Blockers** when prior feedback exists:

```markdown
**Re-review**
- ✅ Addressed: …
- ⚠️ Still open: …
- 💬 Discussed (no change needed): …
```

If there was no prior review, skip this step and omit the **Re-review** section.

## Step 2 — Linter is set up

**TypeScript/JavaScript** — each new project must have:
- `biome.json` at the project root (copy from `sdk/typescript/express-web-api/biome.json`).
- A `lint` script in `package.json`: `"lint": "biome check src/"` (or `"biome check ."` if server-side `.js` files live outside `src/`).
- `@biomejs/biome` in `devDependencies`.

**C#/.NET** — must be `dotnet format`-clean; run `dotnet format --verify-no-changes` in the project.

Why it matters (do **not** claim "CI failed" if the project is not yet in CI — see Step 3): every example in this repo uses the same linter so style stays consistent, readers can move between projects easily, and maintainers can run `npm run lint` locally before review. Once the project is wired into CI, the workflow runs `npm run lint` — adding the linter at contribution time avoids a follow-up fix. Where to look: the project's `package.json` and root. How to fix: copy `biome.json` from the reference project and add the `lint` script + dev dependency.

## Step 3 — CI wiring

CI is `.github/workflows/sdk-examples-ci.yml`. Each job runs only when its paths change, so a new project is **silently untested** until it's added.

**New TypeScript/React project** — needs BOTH:
1. A filter under the `ts-filter` step whose name matches the project, pointing at the project path + the workflow file.
2. A matching `include` entry (`project:` + `path:`) in the `typescript` matrix. The filter name **must** match the `project` value in `include`.

**New .NET project** — the `dotnet` filter currently covers `sdk/dotnet/**` only. A .NET project outside that path needs its own filter/job.

Why it matters: without this, lint/build never run on the contribution and it can rot. Where to look: `.github/workflows/sdk-examples-ci.yml` (the file has inline comments describing exactly this). How to fix: add the filter + `include` entry mirroring an existing project (e.g. `next-auth-examples`).

## Step 4 — Per-app documentation and env

Each new app needs its own `README.md` containing explicit, copy-pasteable steps:
- **Install** (e.g. `npm ci` / `npm install`).
- **Launch** (e.g. `npm run dev`), including any prerequisites (Node version, .NET SDK).
- **Test / verify** it works (what endpoint to hit, what to expect).
- **Where to get credentials**: a Corti account + API credentials from [Corti Console](https://console.corti.app).

Env conventions:
- A committed **`.env.example`** (never a real `.env`) listing every required variable.
- Variable names follow the repo's `CORTI_` notation and match sibling apps (`CORTI_TENANT_NAME`, `CORTI_CLIENT_ID`, `CORTI_CLIENT_SECRET`, `CORTI_ENVIRONMENT`, `PORT`, …). Compare against `sdk/typescript/express-web-api/.env.example`.
- Real `.env` files must be gitignored and absent from the diff.

Why it matters: contributors and future readers must be able to run the example without tribal knowledge; inconsistent env var names break shared tooling. How to fix: model the README and `.env.example` on the reference project.

## Step 5 — @corti/* dependency versioning

In every new `package.json`, `@corti/*` dependencies (`@corti/sdk`, `@corti/embedded-react`, `@corti/ambient-web`, `@corti/dictation-web`, …) must use a **current** major, not a stale pin:
- a floating major on the current line (e.g. `^3` or `^4` — check npm for what is stable/RC today), **or**
- `"latest"`.

Not allowed: old-major pins (e.g. `^1.2.0`), exact pins (e.g. `"1.2.3"`), or caret ranges that lock to a superseded major. Note: `"file:..."` local references are for local dev only and should not be what gets merged.

Why it matters: examples must track the current SDK so they don't demo stale APIs; an old major silently ages them and can break on install. Where to look: `dependencies` in the new `package.json`. How to fix: set the value to `^<currentMajor>` or `latest`.

## Step 6 — Root README linkage

The root `README.md` must:
- List the new project in the **table under the correct category** with its path, stack, and a one-line description.
- Have a short category description in the "Use Cases" section if it's the first project of a (justified) new category.

Why it matters: the root README is the discovery surface; an unlinked example is invisible. Where to look: the category tables in `README.md`. How to fix: add a table row mirroring existing rows. If the root `README.md` is not in the PR diff, leave an inline comment on the new example's README pointing contributors to add the row.

Do NOT add anything about CI/GitHub Actions to READMEs (repo rule: keep CI out of user-facing docs).

## Step 7 — Folder layout and duplicate categories

**Layout:** every example lives at `{category}/{language-or-stack}/{example-name}/` — the middle segment is the **language or stack**, not a feature/use-case name. Examples: `agents/react/next-agent-chat/`, `ambient/typescript/basic-example/`, `sdk/typescript/express-web-api/`. Flag paths like `agents/rag-search-mcp/...` that skip the language/stack segment or group multiple apps under a feature folder.

**Categories:** existing top-level categories are **embedded-assistant, ambient, dictation, agents, proxy, sdk**. Flag a new top-level category that substantially overlaps an existing one (e.g. a "scribe" folder that is really ambient). Prefer the closest existing category + language folder.

### Middle segment should reflect the stack (soft rule)

The `{language-or-stack}` folder should match what the example **actually is**, not just one library it happens to use. This is guidance, not a hard gate — mention mismatches as **Should fix** or **Nit (optional)** depending on how misleading the path is.

| Segment | Typical fit |
|---------|-------------|
| `react/` | Frontend-first: Vite/CRA React SPA, or Next.js where the app is mainly a React UI (API routes are fine). |
| `typescript/` | Node/Express (or similar) server, full-stack TS with a dedicated `server.ts` / backend package, or backend-heavy examples without React as the primary frame. |
| `javascript/` | Plain Node/Express without TS. |
| `vanilla-ts/` | Browser TS without a React framework. |
| `dotnet/` | .NET / C# projects. |

**Common mismatch:** a project under `react/` that is really a **full-stack TypeScript app** (Express/Fastify server, substantial server-side SDK/auth logic, not just a thin static-file host). Those usually belong in `typescript/` — see `ambient/typescript/basic-example/` (server + client) vs `embedded-assistant/react/basic-example/` (React SPA; server is only token/session plumbing).

**Also flag:** `typescript/` for a pure React SPA with no meaningful backend; `javascript/` when the project is entirely TypeScript; a stack folder that doesn't exist elsewhere in the category without reason.

When the path is slightly off but still discoverable, use **Nit (optional)** and say merge does not depend on it. When the path would send readers to the wrong kind of example, use **Should fix**.

Why it matters: readers and maintainers browse by category then language; a feature-named folder breaks discovery and CI path conventions. How to fix: relocate to `{category}/{typescript|react|javascript|dotnet}/<example-name>/` (split coupled apps into sibling folders if needed, linked from each README). Mirror `agents/react/next-agent-chat/` or `ambient/typescript/basic-example/`.

## Step 8 — Code quality and naming conventions

Examples are teaching material — code should be clear, consistent, and easy to copy. **This step is mandatory:** skim the new project's source files (`src/`, `routes/`, `lib/`, top-level `.js`/`.ts`) and compare against sibling examples in the same stack — especially `sdk/typescript/express-web-api/` and `agents/react/next-agent-chat/`. If you find issues, add **inline review comments** with concrete file names and examples of the correct pattern.

Flag issues that make the example harder to read or maintain, especially **inconsistency** (within the PR or vs the rest of the repo). Do not nitpick every style choice Biome/`dotnet format` already enforces — focus on conventions a linter won't catch. If naming, structure, and SDK usage look good, say so briefly in the review summary under **Code quality** (so maintainers know this was checked).

### Naming conventions (repo standard)

| What | TypeScript / JavaScript | C# / .NET |
|------|-------------------------|-----------|
| Files (modules, routes) | `camelCase.ts` / `camelCase.js` — e.g. `guidedDocuments.ts`, `corti.ts`, `auth.js` | `PascalCase.cs` — e.g. `AgentsEndpoint.cs` |
| React components | `PascalCase.jsx` / `.tsx` — e.g. `AgentChatView.jsx` | n/a |
| Variables, functions | `camelCase` | `camelCase` locals/parameters |
| Classes, types, interfaces | `PascalCase` | `PascalCase`; interfaces prefixed `I` |
| Env vars | `SCREAMING_SNAKE_CASE` with `CORTI_` prefix (see Step 4) | config keys match repo peers |
| Route paths / folders | lowercase or `camelCase` segments — e.g. `routes/`, `src/routes/` | `Endpoints/` |

**Flag:** mixed styles in one project (`snake_case`, `PascalCase` module files, kebab-case source files unless config tooling requires it), the same concept named differently (`tenant` vs `tenantName` vs `CORTI_TENANT` in code), abbreviations used inconsistently (`ctx` in one file, `contextId` in another without reason), or env vars that break the `CORTI_*` pattern (Step 4).

**Structure** — mirror patterns peers already use: Express apps keep routes under `routes/` or `src/routes/`, shared SDK wiring in `lib/` or a dedicated module (`corti.ts` / `corti.js`), config/env loading in one place (`config.js` or `src/lib/corti.ts`). Flag god-files, duplicated logic, or layouts that diverge without reason (e.g. server code split oddly between repo root and `src/` when peers use a single `src/` tree).

**General** — prefer small focused modules, descriptive names over comments, and the same patterns for the same job (error handling, API client setup, env validation) as the reference example. Call out dead code, commented-out blocks left in, or copy-paste that drifted.

### Prefer the SDK over raw HTTP

Examples should integrate Corti through the **SDK** (`@corti/sdk`, `@corti/dotnet` / `CortiClient`, or the stack-specific package such as `@corti/embedded-react`, `@corti/ambient-web`) for **both authentication and API calls**, unless there is a **very specific, documented reason** to call `auth.{region}.corti.app` or `api.{region}.corti.app` directly.

Why it matters: the SDK handles token refresh, validates request/response shapes at compile time (especially valuable on the frontend), guides developers toward correct payloads, and avoids unnecessary bad requests hitting the API. Raw `fetch`/`axios`/`HttpClient` calls to Corti URLs are harder to copy safely and teach patterns we don't want readers to adopt by default.

**Use the SDK for:**
- Auth: `CortiAuth.getToken`, `CortiClient` with `clientId`/`clientSecret`, ROPC/PKCE helpers — not hand-rolled OAuth POSTs to `auth.*.corti.app`.
- API: `client.interactions.create`, `client.documents.generate`, streaming helpers, etc. — not manual REST to `api.*.corti.app/v2/...`.

**Where to look:** any `fetch(` / `axios` / `HttpClient` whose URL contains `corti.app`; manual `Authorization: Bearer` assembly; JSON bodies built by hand for endpoints the SDK already exposes. Compare against `sdk/typescript/express-web-api/src/lib/corti.ts` (shared client wiring), route files that call `CortiClient` methods, `ambient/typescript/basic-example/`, and `sdk/dotnet/web-api/CortiHelpers.cs`.

**How to fix:** add `@corti/sdk` (or the .NET package), centralize client setup in one module (`corti.ts`, `CortiHelpers.cs`), and replace raw HTTP with the matching SDK method.

**Acceptable exceptions** (must be obvious in code or README — otherwise **Should fix**):
- The example's stated purpose is comparing SDK vs non-SDK paths (e.g. `sdk/typescript/express-web-api/src/routes/clientVariants.ts`).
- The SDK does not yet expose the API surface being demonstrated — add a short comment explaining why raw HTTP is required.
- A `proxy/` example forwards arbitrary paths but still uses the SDK on the server for auth (see `proxy/javascript/basic-example/corti-setup.js`).

Do not flag Postman collections or out-of-scope artifacts (see **Not in scope**).

Why it matters (naming/structure): readers treat these examples as the canonical way to integrate Corti; inconsistent naming makes copy-paste error-prone and teaches bad habits. Where to look: file names first, then exports/functions in `routes/`, `src/`, and shared modules. How to fix: align with the nearest existing example in the same stack; rename only where inconsistency is clear — no drive-by refactors.


## Step 8b — Analytics tagging (required)

Corti must be able to tell **which example** produced API traffic. SDK `analytics` is `Record<string, string>` — **no nested objects**.

Required payload:

```json
{ "examples_repo": "<repo-relative-path>" }
```

Value is the example directory from repo root, no leading slash (e.g. `ambient/typescript/basic-example`, `sdk/typescript/applets`, `sdk/dotnet/web-api`). Prefer one shared constant per example rather than repeating the string at every call site.

| Surface | How |
|---|---|
| JS/TS `CortiClient` | `analytics: { examples_repo: "<path>" }` on the constructor |
| .NET `CortiClient` | `CortiRequestOptions.Analytics["examples_repo"] = "<path>"` on every `new CortiClient(...)` |
| Direct REST (no SDK) | header `x-corti-analytics: {"examples_repo":"<path>"}` |
| Direct WebSocket | same JSON as query param `x-corti-analytics` (browsers cannot set WS headers). `encodeURIComponent(JSON.stringify({ examples_repo: "<path>" }))` |
| Dictation / ambient web component | `el.analytics = { examples_repo: "<path>" }` (or the example's shared constant) |
| Embedded assistant | same `analytics` property on the element |

Do **not** invent extra keys, nest the value, or set reserved `sdk_type` / `sdk_version` — the SDK fills those.

**Where to look:** every `new CortiClient(` / `CortiClient {` without `analytics` / `Analytics`; `fetch` / proxy middleware to `api.*.corti.app` without `x-corti-analytics`; `new WebSocket(` / `wss://` to Corti without the query param; `<corti-dictation>`, `<corti-ambient>`, `<corti-assistant>` (or React wrappers) without `.analytics`. A helper that already carries `examples_repo` and is passed into the client counts; a second client in the same example that omits it does not.

**How to fix:** copy the shared-constant pattern from `sdk/typescript/express-web-api/src/lib/corti.ts` (`EXAMPLES_ANALYTICS`), `sdk/dotnet/web-api/CortiHelpers.cs` (`ExampleRequestOptions`), applets REST proxy `sdk/typescript/applets/server/routes/proxy.ts` (header), or web-component `el.analytics` in `dictation/typescript/web-component/` / `ambient/typescript/web-component/`.

**Skip (not Corti API traffic):** Keycloak / token mint only (`CortiAuth`, next-auth token routes with no PAPI calls); MCP-only processes that never call Corti HTTP/WS; JSON fixtures (commands, replacements). If the example only mints a token and a sibling package makes the Corti calls, tag **that** surface.

**Severity:** missing tag on live Corti REST/WS → **Blocker**. Wrong/nested `examples_repo` path → **Should fix**. Direct WS using a header instead of the query param → **Blocker**.

## Step 9 — Security review (delegate)

Launch a **`security-review` subagent** (readonly, foreground) scoped to the contribution's diff. Give it `references/security-checklist.md` from this skill as its rubric. If the subagent cannot compute a diff (e.g. shallow clone), perform the security pass manually by reading auth/token/config/frontend files — do not skip this step.

Focus areas:
- Corti API credentials (client id/secret, tokens) hardcoded, committed, or shipped to the **browser/frontend**.
- Any direct browser→Corti API call that exposes credentials — the correct pattern is a server-side proxy (see `proxy/` and the root README's Proxy note).
- **All-purpose access tokens in the frontend** (see below) — treat as a **blocker** unless the code has an explicit, prominent warning that this is demo-only and must never be done in production.
- Real secrets in `.env`, config, or sample files instead of placeholders.
- Logging of secrets/PHI; overly permissive CORS; secrets baked into client bundles (`VITE_`/`NEXT_PUBLIC_` holding secrets).

**Dev server bind (Should fix, not Blocker):** if the app binds to all interfaces (`host: "::"`, `0.0.0.0`, Vite `--host`) **and** exposes unauthenticated token/proxy routes backed by server credentials, ask them to bind to `localhost` (prefer the hostname `localhost`, not a numeric loopback IP) and note local-dev-only in the README. See `references/security-checklist.md`.

**Do not treat as Should fix / Blocker** when the server is already localhost-only:
- Unauthenticated local token or proxy routes (same as peer web-component examples).
- Default CORS on a local Express demo without cookie sessions.

### All-purpose tokens must not reach the browser

Tokens from `auth.{region}.corti.app` (OAuth/client-credentials) or from SDK auth (`CortiAuth.getToken`, `CortiClient` client-credentials flow) without **scoped** limits are **multi-purpose**: they grant access to all of the tenant's data, not just the one feature the example needs. If that token is sent to React/JS in the browser (API response, props, `localStorage`, `VITE_*`/`NEXT_PUBLIC_*`, WebSocket init, etc.), anyone who steals it can access everything — not just stream or transcribe.

**Acceptable:** mint a **scoped token** on the server and pass only that short-lived token to the client. See [Scoped tokens](https://docs.corti.ai/sdk/js/authentication#scoped-tokens) and repo examples: `ambient/typescript/web-component/server.ts` (`scopes: ["streams"]`), `dictation/typescript/web-component/server.ts` (transcribe scope).

**Not acceptable without remediation:**
- Returning an unscoped / all-purpose `accessToken` from a server route that the frontend then uses with `CortiClient`.
- Calling `auth.{environment}.corti.app` or `CortiAuth.getToken` **in client-side code** (browser bundle).
- Passing client id/secret to the browser to obtain a token there.

**If the example intentionally demos an all-purpose token in the browser** (discouraged): it must include **explicit comments** at the token handoff (server route + client consumer) stating this is **bad practice**, the token has **full tenant access**, and **never expose an all-purpose token in production** — use scoped tokens or keep auth server-side. Without those warnings, flag as **Blocker**.

Where to look: server routes named `token`, `auth`, `session`, `start-session`; frontend `CortiClient` / `auth: { accessToken }` wiring; any `fetch` to Corti auth endpoints from `src/`, `app/`, or `.jsx`/`.tsx` files. How to fix: mint scoped tokens server-side (mirror `ambient/typescript/web-component/server.ts`) or proxy all Corti calls through the backend (`proxy/`, `sdk/typescript/express-web-api/`).

Fold the subagent's findings into the review as high-priority comments.

## Step 10 — Create a PENDING GitHub review

Compose one comment per issue. Each comment: **what**, **why it matters** (assume a non-expert author), **where** (file/path), **how to fix** with a link/path to a compliant existing example.

**Summary body must only roll up inline comments.** The review `body` groups findings under **Re-review** (if applicable), **Blockers**, **Should fix**, **Nits (optional)**, and optionally a short **Code quality** note — but every bullet in those finding sections must correspond to an inline comment you left on the diff. Do **not** add summary-only asks (CI wiring, lockfile, root README, optional nits, etc.) that have no matching code comment.

If a finding targets a file **not in the PR diff** (e.g. `.github/workflows/sdk-examples-ci.yml`, root `README.md`, missing `package-lock.json`), still leave an **inline comment on a related changed file** (usually the new project's `package.json` or `README.md`) that explains what to add and where — then the summary can mention it because it is connected to that comment. Never put a finding only in the summary.

**Label severity in every inline comment** — start the first line with the level so contributors can tell what is required vs optional:
- Blockers: `**Blocker:** …`
- Should fix: `**Should fix:** …`
- Nits: `**Nit (optional — not required for merge): …` and say explicitly that merge does not depend on it
- Code-quality nits follow the same optional nit label when not blocking

**Always open the review summary `body` with this disclaimer** (first thing, before thanks or findings):

> _These comments were written with AI assistance and validated by a person. They may still be more robust than you expect — please ask if anything seems off or unclear._

Create the review as **pending** by POSTing with **no `event` field** (an `event` of `APPROVE`/`REQUEST_CHANGES`/`COMMENT` would submit it — do not do that). Build a JSON payload and send it:

```bash
cat > /tmp/review.json <<'JSON'
{
  "body": "_These comments were written with AI assistance and validated by a person. They may still be more robust than you expect — please ask if anything seems off or unclear._\n\nThanks for the contribution! A few things to address before this is merge-ready — each item below matches an inline comment on the diff.\n\n**Blockers**\n- ...\n\n**Should fix**\n- ...",
  "comments": [
    { "path": "path/to/package.json", "line": 12, "body": "**Should fix: Missing linter.** ... why ... how: copy `sdk/typescript/express-web-api/biome.json`." }
  ]
}
JSON

gh api \
  --method POST \
  repos/corticph/sdk-typescript-examples/pulls/<num>/reviews \
  --input /tmp/review.json
```

Line-level comments must reference lines present in the PR diff. After posting, confirm the review is `state: PENDING` and tell the user it's a draft awaiting their submission — do not submit it.

## References
- [references/security-checklist.md](references/security-checklist.md) — rubric for the Step 9 subagent.

## Not in scope (unless the user asks)

- Postman collections (`sdk/postman/`) — only when the contribution adds a **new API surface** meant for external testing, per repo implementation-order rules.
- Rewriting contributor code beyond what review comments request.
- Submitting the GitHub review (`event` field) — always leave it **pending** for a human.