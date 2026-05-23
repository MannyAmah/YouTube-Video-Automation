# YouTube Automation Agent Build And Launch Plan

Date: 2026-05-22
Repo: `darkzOGx/youtube-automation-agent`
Branch: `master`

## Office-Hours Diagnosis

The request is "build this from beginning to end, launch it live." The sharp truth:
this repo is not launch-ready as-is. It is a promising prototype, but it currently
fails its own tests, cannot boot without private credentials, has a browser-side
dashboard bug, and carries high-severity dependency findings.

The right first launch is not "auto-post to YouTube today." That would require:

- Google OAuth client credentials and YouTube refresh tokens.
- OpenAI, Gemini, or another AI provider key.
- A persistent runtime, because background schedulers and SQLite do not belong on
  a serverless-only deployment.
- A review of YouTube policy and channel safety settings before public posting.

The correct MVP launch is:

- A live, public setup dashboard that boots safely without credentials.
- Clear runtime status showing whether automation is active or waiting for setup.
- Health, schedule, analytics, and generation endpoints that fail gracefully.
- Deployment files for a persistent Node host.
- A deployable preview on Vercel only if we accept that it is a setup/status app,
  not the 24/7 worker.

## CEO Review

Recommendation: split launch into two states.

1. Setup Mode
   - App is live.
   - Dashboard works.
   - Health endpoint reports missing credentials.
   - No scheduler runs.
   - Generate/publish endpoints return clear `503 setup_required`.

2. Automation Mode
   - Credentials and tokens are present.
   - Agents initialize.
   - Scheduler starts.
   - Content generation and publishing are enabled.

This avoids the bad founder trap: shipping a "live" URL that immediately dies
because secrets are missing. It also prevents accidental YouTube posting before the
channel, policy, and privacy settings are confirmed.

## Engineering Review

Current findings from preflight:

- `npm test` fails because `agents/thumbnail-designer-agent.js` requires `sharp`,
  but `sharp` is missing from `package.json`.
- `index.js` exits when credentials are missing, so the app cannot be deployed for
  setup or demo.
- `dashboard/index.html` calls `process.uptime()` in browser JavaScript, which
  throws because `process` is not defined in the browser.
- `/analytics` assumes agents are initialized and will 500 in setup mode.
- `/generate` and `/publish/:contentId` need explicit setup guards.
- `npm audit` reports 33 vulnerabilities: 3 low, 16 moderate, 14 high.
- The repo tracks 52 generated `data/*` artifacts. They are not secrets, but they
  are runtime output and should not grow in source control.

## Target Architecture

```text
Browser
  |
  v
Express app
  |
  +-- static dashboard
  +-- /health     -> always available
  +-- /schedule   -> DB-backed, safe in setup mode
  +-- /analytics  -> setup-safe fallback until agents are active
  +-- /generate   -> guarded until automation is configured
  +-- /publish    -> guarded until automation is configured
  |
  v
SQLite data store
  |
  v
Agents + DailyAutomation scheduler
  |
  +-- only starts when credentials and tokens validate
```

## Implementation Plan

1. Add a production-safe startup path.
   - Always initialize the database and API routes.
   - Keep the app running in setup mode when credentials are missing.
   - Start agents and scheduler only when credentials validate.

2. Add setup-aware API responses.
   - `/health` returns `status`, `mode`, `configured`, `automationActive`,
     `uptimeSeconds`, agent names, and missing setup notes.
   - `/generate`, `/publish/:contentId`, and `/analytics` return clear setup-mode
     responses instead of crashing.

3. Fix dashboard runtime errors.
   - Remove browser use of `process`.
   - Render setup mode honestly.
   - Keep controls disabled or clearly failing until configured.

4. Fix test failure.
   - Add the missing `sharp` runtime dependency, because the thumbnail agent uses
     it directly.
   - Extend tests to cover setup-mode startup.

5. Add deployment support.
   - Add a `Dockerfile` and `.dockerignore` for Render/Fly/Railway/VPS.
   - Add `render.yaml` as the recommended persistent-host deployment config.
   - Add `vercel.json` only if we decide to launch the setup dashboard on Vercel,
     with a documented caveat that serverless is not the 24/7 worker runtime.

6. Update docs.
   - Add a launch section explaining setup mode versus automation mode.
   - Document required secrets and OAuth callback configuration.
   - Document why Vercel preview is not a full automation deployment.

7. Verify.
   - `npm test`
   - `npm audit`
   - Local `npm start`
   - Browser QA against `http://localhost:3456`
   - Health, schedule, analytics, and guarded generation endpoints.

8. Launch.
   - Preferred: deploy persistent Node service to Render/Fly/Railway/VPS once
     deployment credentials are available.
   - Fallback: deploy a Vercel live setup preview if the Vercel connector can deploy
     the project and we accept the serverless limitation.

## Definition Of Done For This Sprint

- The app boots locally without credentials.
- Tests pass.
- Dashboard works in a real browser.
- The project has persistent-host deployment files.
- A live URL exists if a deploy target is available in this environment.
- The final report clearly states whether the live URL is setup mode or full
  automation mode.

## Open Decision

Approve this plan and deployment split:

- Recommended path: build setup-safe app now, add persistent-host deployment files,
  and use Vercel only as a live setup preview if available.
- Full automation launch requires your Google OAuth client, YouTube tokens, and AI
  provider key as environment secrets on a persistent Node host.
