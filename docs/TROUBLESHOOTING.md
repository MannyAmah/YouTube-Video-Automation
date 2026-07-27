# Troubleshooting

## Boot

**"Invalid environment configuration" and the service exits**
The env contract failed — the message lists each bad variable. Common:
`APP_ENCRYPTION_KEY` not 64 hex chars; `ADMIN_PASSWORD` too short;
`PUBLIC_URL` missing scheme.

**API starts but dashboard 404s**
`apps/web/dist` missing — run `pnpm --filter @yva/web build` (the Docker
image does this; locally `pnpm build` covers it). Custom locations: set
`WEB_DIST`.

**Prisma "Can't reach database server"**
Check `DATABASE_URL`, Postgres up, network. On Railway use the reference
variable `${{Postgres.DATABASE_URL}}`.

## Pipeline steps

**research fails: "openFDA returned no drug labels"**
The medication name didn't match a marketed US product label. Try the
generic name. Combination products and supplements are out of scope by
design.

**research fails: HTTP 429 from api.fda.gov**
openFDA rate limit (240/min unauthenticated per IP). Retries back off
automatically; persistent 429s → wait, or add an api.fda.gov API key by
extending `openfda.ts` (append `&api_key=`).

**script step fails schema validation repeatedly**
Model returned malformed JSON 3 times. Check `OPENAI_TEXT_MODEL` supports
JSON mode; try `gpt-4o`. The JobEvent detail contains the Zod issues.

**Script bounces to FAILED after 3 revisions**
The editorial policy failures are stored on each script version — read
them in the run detail. Typically the label had almost no usable sections
(claim-density failure). That medication may need a different angle or a
manual script in supervised mode.

**assets step: MissingProviderError**
The named key is absent. Set it (docs/AI_PROVIDERS.md) and Retry — already
generated scenes are reused.

**render fails: "drawtext: No such file"**
DejaVu fonts missing — install `fonts-dejavu` (the worker Docker image
includes it) or adjust font paths in `packages/media/src/ffmpeg.ts`.

**render fails: concat "Impossible to open ... clip"**
You're on a custom fork touching `render.ts` — concat entries must stay
absolute paths (see the comment there; regression came from relative
MEDIA_ROOT).

**quality_check fails duration_range**
Narration ran far from target (TTS pacing). Check scene count and
narration lengths in the storyboard; adjust `targetDurationSec` on the
brief or regenerate the script.

## Upload / publish

**upload fails: "Video file missing/too small"**
The artifact validation caught a bad file — exactly its job. Look at the
render artifacts; Retry from RENDERING (run's retry target).

**upload fails 401 invalid_grant**
Refresh token revoked or expired (OAuth app in "Testing" mode expires
tokens after 7 days — move it to "In production",
docs/GOOGLE_YOUTUBE_OAUTH.md). Reconnect YouTube, Retry.

**upload fails quotaExceeded**
YouTube Data API daily quota exhausted (uploads cost ~1600 units). Wait
for the PT-midnight reset or request a quota increase.

**Video uploaded but run FAILED afterwards**
Re-running the upload step is safe: publication already stores the video
id, so the step skips the upload and continues (or reconciles by exact
title if the crash predated the id write).

**publish step keeps rescheduling**
Daily quota reached (`maxPublishesPerDay`) — the log line says so, and the
job is delayed to tomorrow 15:00 UTC. Raise the quota in Settings if
intended.

## Queues / Redis

**Jobs sit in "delayed" forever**
Usually the emergency pause (banner on the dashboard) or channel paused.
The `resume_runs` scheduler re-enqueues within 30 minutes of unpausing.

**"Missing lock for job" warnings after a worker restart**
Benign: BullMQ reclaimed stalled jobs; state guards make the replay a
no-op.

## Dashboard

**Login always 401 with correct password**
Seed ran with a different `ADMIN_PASSWORD` than you're typing — the seed
only creates the user if absent. Update:
delete the AdminUser row and re-run `pnpm db:seed`, or change the env to
the original password.

**Video preview doesn't play**
The artifact streams with its stored MIME. In the two-service Railway
topology the file lives on the worker's volume and the API proxies it —
`WORKER_INTERNAL_URL` must be set on the API service and both services
must share the same `SESSION_SECRET` (the proxy token is derived from it).
404 from the proxy → check those two variables and that the worker is up.
