# Operations Runbook

## The one control that matters

**Emergency pause** — dashboard → Settings → "Pause everything" (or set
`EMERGENCY_PAUSE=true` and redeploy). Effects: pipeline jobs defer, nothing
uploads, nothing publishes, schedules no-op. Runs freeze in place and
resume exactly where they were when unpaused (the half-hourly
`resume_runs` job re-enqueues them).

Use it the moment anything looks wrong publicly: a bad video, a policy
strike, weird content. Then investigate calmly.

## Daily health signals

- Dashboard header: pause banner absent, provider dots green, queue
  `failed: 0`.
- `/api/healthz` and worker `/healthz` return `ok: true`.
- One new run per day progressing to PUBLISHED (autonomous) within the
  quota.

## Playbooks

### A run is FAILED

1. Open the run → read `failureReason` and the Job events table.
2. Provider/config errors (MissingProviderError, 401s): fix the env var or
   key, then **Retry** — the run re-enters the failed step; completed
   artifacts are reused (no double spend).
3. Render/QC failures: inspect artifacts and `render-work/` in the run's
   media directory; after a fix, Retry re-renders.
4. Script policy failures after 3 revisions: read the recorded review
   failures on the script — usually the evidence bundle was thin for that
   medication. Cancel the run, or improve the label selection and retry.

### Queue looks stuck (jobs waiting, nothing active)

1. Worker deploy logs — is the worker up? `/healthz` responding?
2. Redis reachable? (worker healthz includes a ping).
3. A crashed worker's active jobs return to waiting automatically
   (BullMQ stalled-job handling, ~60s). `resume_runs` covers runs whose
   enqueue was lost mid-transition.
4. Last resort: restart the worker service — state guards make replayed
   jobs harmless.

### Duplicate-upload scare

The system prevents duplicates via (a) publication video-id idempotency,
(b) deterministic job ids, (c) exact-title reconciliation before
re-uploading after an ambiguous crash. If you ever see two copies on the
channel: delete one in YouTube Studio, set the surviving id on the
`Publication` row, and file the incident in `docs/solutions/`.

### Bad video went public (autonomous mode)

1. Emergency pause.
2. In YouTube Studio: set the video private (or delete).
3. Update the `Publication` row privacy to match; optionally Cancel the run.
4. Root-cause via the run's script/citations/QC artifacts before unpausing;
   consider `PUBLISH_MODE=supervised` while tuning.

### YouTube token failures (401/invalid_grant on upload)

1. Settings → connection shows connected but uploads fail → the refresh
   token was revoked/expired (e.g. OAuth app still in "Testing" mode —
   see docs/GOOGLE_YOUTUBE_OAUTH.md §2.5).
2. Reconnect YouTube in Settings; Retry the failed run.

### Disk pressure on the media volume

Each long-form run stores ~20–40MB (video + scenes + audio). Prune old
runs' directories after PUBLISHED (artifacts for published videos can be
re-downloaded from YouTube if ever needed):
`rm -rf $MEDIA_ROOT/runs/<old-run-id>` — database records keep the
publication history either way.

### Provider outage (OpenAI/ElevenLabs down)

Steps fail with retryable errors and back off (3 attempts, exponential).
Runs end FAILED with retry targets; when the provider recovers, Retry each
run (or leave them — nothing rots). TTS degrades ElevenLabs → OpenAI
automatically.

## Scheduled behaviour reference

| Schedule | Cron (UTC) | Action |
| --- | --- | --- |
| daily_brief | 0 9 * * * | next backlog medication → new run (skips if paused / ≥3 in flight) |
| analytics_sync | 0 */6 * * * | YouTube statistics snapshots |
| resume_runs | */30 * * * * | re-enqueue stalled/paused runs |

## Incident log

Record every real incident and its fix in `docs/solutions/` (dated file) —
compounding operational knowledge was a stated v2 goal.
