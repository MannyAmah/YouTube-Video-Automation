# Setup-Safe YouTube Automation Launch

Date: 2026-05-22

## Context

The upstream YouTube automation agent assumed all production credentials were present before the server could boot. That made it impossible to launch a public preview safely, and risky to wire directly to YouTube without Google OAuth tokens, AI provider keys, and a persistent worker host.

## Decision

Launch the project in setup-safe mode first:

- The dashboard, `/health`, and `/analytics` stay online without secrets.
- Mutating automation endpoints such as `/generate` and `/publish/:contentId` return `503 setup_required` until required credentials are configured.
- Vercel is treated as a public setup/status preview, not the 24/7 automation worker.
- Render/Docker are provided for the persistent worker deployment path where SQLite disk state and cron jobs are appropriate.

## Lessons

- Bootability is a launch requirement. Credential checks should degrade into an explicit setup mode instead of killing the process.
- Serverless previews should not eagerly import native persistence dependencies. Lazy-load `sqlite3` and use a memory adapter for setup/status endpoints.
- Browser QA catches product issues tests miss. In this launch it caught the dashboard's mobile horizontal overflow and a floating control that overlapped content.
- Publishing automation must fail closed. Until OAuth and provider secrets are present, generation and upload routes should be disabled even if the dashboard is public.

## Reuse

For future agent launches, split readiness into three levels:

1. Public setup preview: health, setup status, docs, and disabled mutating actions.
2. Staging automation: real secrets, private publishing, seeded test prompts, manual approval.
3. Production automation: persistent host, monitoring, rate limits, audit logs, and alerting.
