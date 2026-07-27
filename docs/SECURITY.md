# Security

## Secrets

- All secrets live in environment variables (Railway service variables /
  local `.env`, which is gitignored). Nothing secret is committed.
- The env contract (`packages/shared/src/env.ts`) validates shape at boot;
  `APP_ENCRYPTION_KEY` must be exactly 32 bytes hex, `SESSION_SECRET` ≥ 16
  chars, `ADMIN_PASSWORD` ≥ 10 chars.
- Pino redaction censors `authorization`, `cookie`, and any field named
  like a token/key/secret at any depth. Provider adapters never log
  request headers or bodies.

## Authentication & authorization

- Single-admin model: `AdminUser` with scrypt password hashes (Node crypto,
  per-hash salt, timing-safe compare).
- Sessions: JWT (12h) in an `HttpOnly`, `SameSite=Strict`, `Secure`
  (production) cookie. SameSite=Strict is the CSRF defense for all
  mutating routes; all bodies are JSON.
- Every route except `/api/healthz`, `/api/auth/login`, and the OAuth
  callback requires the session (`AuthGuard`). The API tests assert 401 on
  every protected route — the v1 "anyone can trigger paid generation"
  hole is regression-tested.
- Login is rate-limited (10 attempts / 15 min / IP) and returns identical
  errors for unknown email vs wrong password.

## OAuth (Google/YouTube)

- Authorization flow starts only from an authenticated session.
- `state` is HMAC-SHA256-signed (SESSION_SECRET) with a nonce and 10-min
  expiry; the callback rejects missing/invalid/expired state — login-CSRF
  protection the v1 flow lacked.
- Refresh tokens are encrypted with AES-256-GCM under `APP_ENCRYPTION_KEY`
  before storage; plaintext tokens exist only in memory. Tokens never
  appear in API responses or logs.
- Scopes are the minimum for upload + channel read + analytics read.

## Publishing safety

- Uploads are hard-coded `privacyStatus: private`; the YouTube clients
  refuse anything else. Publishing is a separate, quota-checked step that
  confirms the privacy flip via the API before recording PUBLISHED.
- The emergency pause (env `EMERGENCY_PAUSE` or the dashboard switch,
  stored in `Setting`) halts all processing and publishing.
- Every approval (policy or human) is an audit row.

## Artifact integrity

- `ArtifactStore` rejects paths escaping `MEDIA_ROOT`, refuses empty
  files, and records sha256 for every artifact; consumers re-verify size
  before use. Upload preflight re-validates the exact MP4 on disk.

## Threat model notes

| Threat | Mitigation |
| --- | --- |
| Stolen session cookie | HttpOnly+Strict+Secure, 12h expiry |
| CSRF on approve/publish | SameSite=Strict + JSON-only bodies |
| OAuth login CSRF / code injection | signed state w/ nonce+expiry |
| DB dump leaks YouTube tokens | AES-256-GCM at rest; key only in env |
| Malicious/failed provider output | Zod validation + media validation + policy review |
| Fabricated health claims | evidence-only prompting + citation policy + banned phrases |
| Runaway publishing | private-first, daily quota, emergency pause, backlog cap |
| Path traversal via artifact ids | store-level containment check |

## Dependency hygiene

`pnpm audit` is clean at the time of writing (overrides pin patched
transitive versions). Re-run in CI on every PR; treat new highs as
blockers.

## Reporting

This is a single-operator system; report issues via the repository's issue
tracker. Do not include tokens or `.env` contents in issues.
