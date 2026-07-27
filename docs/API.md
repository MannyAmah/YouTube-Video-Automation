# API Reference

Base path: `/api`. All responses JSON. Authentication: session cookie
(`yva_session`) obtained from login; every route except `healthz`, `auth/
login`, and the OAuth callback returns **401** without it. Errors follow
Nest's shape: `{ "statusCode": 400, "message": "..." }`.

## Auth

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | `{email, password}` | sets HttpOnly cookie; 401 on bad creds; rate-limited |
| POST | `/auth/logout` | — | clears cookie |
| GET | `/auth/me` | — | `{email}` |

## System

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/healthz` | unauthenticated; `{ok, checks:{database, redis}}` |
| GET | `/status` | providers, publishMode, emergencyPause, channel, queue counts, run-state counts, testMode |
| POST | `/settings/pause` | `{paused: boolean}` — global emergency pause |
| PATCH | `/channels/:id` | `{publishMode?, paused?, maxPublishesPerDay?, title?}` |
| GET | `/analytics` | publications + raw YouTube snapshots |

## OAuth

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/oauth/google/start?channelId=` | authenticated; redirects to Google with signed state |
| GET | `/oauth/google/callback` | validates state, stores encrypted refresh token, verifies channel |

## Runs

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/runs` | — | latest 100 with brief + publication summary |
| GET | `/runs/:id` | — | full detail: brief, publication, approvals, artifacts, latest script, job events |
| POST | `/runs` | `{medication, channelId?}` | 202 `{runId}`; starts research immediately |
| POST | `/runs/:id/approve-script` | — | supervised: SCRIPT_REVIEW → STORYBOARDING |
| POST | `/runs/:id/reject-script` | `{notes?}` | supervised: back to SCRIPTING with notes fed to the model |
| POST | `/runs/:id/approve-upload` | — | supervised: AWAITING_APPROVAL → APPROVED (+upload) |
| POST | `/runs/:id/publish` | — | supervised: UPLOADED_PRIVATE → SCHEDULED (+publish) |
| POST | `/runs/:id/retry` | — | FAILED → its retryTargetState |
| POST | `/runs/:id/cancel` | — | any non-terminal → CANCELLED |
| GET | `/runs/:id/artifacts/:artifactId/file` | — | streams the artifact with its stored MIME type |

State-mismatch actions return **400** with the current state — clients
should refresh and re-render, never retry blindly.

## Conventions

- All mutating routes are cookie-authenticated JSON POST/PATCH;
  SameSite=Strict is the CSRF control.
- Run actions are idempotent at the state-machine level: repeating an
  action whose transition already happened yields 400, not duplicate work.
- Job enqueues from the API use the same deterministic jobId scheme as the
  worker, so double-clicks cannot double-process.
