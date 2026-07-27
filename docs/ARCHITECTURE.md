# Architecture

## Services

```
Browser ──► API service (NestJS, apps/api)
              ├─ authenticated dashboard (serves apps/web build)
              ├─ admin auth (JWT cookie, scrypt password)
              ├─ Google OAuth flow (signed state, encrypted tokens)
              ├─ run actions (start / approve / reject / retry / cancel / publish)
              └─ artifact streaming (video/thumbnail/script previews)
              │
              ├──► PostgreSQL (Prisma) ◄──┐
              └──► Redis (BullMQ queues) ◄┤
                                          │
        Worker service (NestJS standalone, apps/worker)
              ├─ pipeline queue consumer (concurrency 2)
              ├─ scheduler queue (daily briefs, analytics, crash recovery)
              └─ media store (persistent volume: MEDIA_ROOT)
```

Both services boot from the same environment contract
(`packages/shared/src/env.ts`) and refuse to start misconfigured. Provider
keys are optional at boot ("setup-safe"): the dashboard shows exactly which
capabilities are configured, and a step missing its provider fails that run
with instructions instead of pretending to succeed.

## Data model (packages/db/prisma/schema.prisma)

- `Channel` — YouTube identity + policy (publishMode, paused, daily quota).
- `OAuthConnection` — AES-256-GCM-encrypted refresh token, scopes.
- `ContentBrief` — medication, angle, format, audience note.
- `ProductionRun` — the workflow instance; `state` is the single source of
  truth for where a video is in its life.
- `Script` / `Storyboard` — versioned, Zod-validated JSON documents.
- `Artifact` — every produced file: kind, **relative** path, MIME, bytes,
  sha256, producer, metadata. Absolute paths never enter the database.
- `Approval` — who (human or policy) approved what, when, with notes.
- `Publication` — YouTube video id, privacy, schedule, upload timestamps.
- `AnalyticsSnapshot` — raw YouTube metrics; never synthesized.
- `JobEvent` — per-step attempt log (observability).
- `AdminUser`, `Setting` — auth and global switches (emergency pause).

## State machine

```
DRAFT → RESEARCHING → SCRIPTING → SCRIPT_REVIEW → STORYBOARDING
      → GENERATING_ASSETS → RENDERING → QUALITY_CHECK → AWAITING_APPROVAL
      → APPROVED → UPLOADING_PRIVATE → UPLOADED_PRIVATE → SCHEDULED → PUBLISHED

SCRIPT_REVIEW ↩ SCRIPTING            (bounded automatic revisions)
any active state → FAILED            (with retryTargetState)
FAILED → its retry target            (operator "Retry")
any non-terminal → CANCELLED
```

Defined in `packages/shared/src/states.ts`; enforced twice:

1. `assertTransition` validates against the transition table;
2. `runStateTransition` (packages/db) applies it with an optimistic
   `UPDATE ... WHERE state = <expected>`, so two workers can never
   double-apply — the loser gets `StaleRunStateError` and treats the job as
   a no-op.

## Queue topology

- Queue `pipeline`: one job per (run, step, epoch), jobId
  `<runId>:<step>:e<epoch>` — deterministic ids make enqueues idempotent.
  Retries: 3 attempts, exponential backoff. Long `lockDuration` for renders
  and uploads; BullMQ stalled-job recovery covers worker crashes.
- Queue `scheduler`: durable repeatable jobs (`upsertJobScheduler`) —
  `daily_brief` (09:00 UTC), `analytics_sync` (6-hourly), `resume_runs`
  (half-hourly crash/pause recovery). Repeatable schedules live in Redis and
  survive deploys; replicas cannot double-fire.

Every step re-validates the run's state on entry
(`STEP_ENTRY_STATE`), so lost/duplicate/late jobs are harmless.

## Autonomous vs supervised

The channel's `publishMode` decides who approves:

| Gate | autonomous | supervised |
| --- | --- | --- |
| Script review | `reviewScript` policy (citation coverage, banned phrases, statistic checks) | policy first, then human approve/reject in dashboard |
| Upload approval | `reviewQc` policy on the ffprobe report | human approve in dashboard |
| Publish | automatic, daily quota + pause checks | human "Publish now" |

Every approval — human or policy — is recorded in `Approval`.

## Provider layer

`packages/providers` defines interfaces (`TextProvider`, `TtsProvider`,
`ImageProvider`, `YouTubeClient`) and a registry that is the only place
providers are constructed. `TEST_MODE=true` swaps in offline fakes that
produce real files and can never touch the network/YouTube. There is no
placeholder-success path: adapters either produce a validated artifact or
throw.

## Storage

Artifacts live under `MEDIA_ROOT/runs/<runId>/`. The `ArtifactStore`
enforces path containment, checksums every file, and refuses to record
empty files. The interface is deliberately narrow so a future S3/R2 backend
only needs to reimplement the store.
