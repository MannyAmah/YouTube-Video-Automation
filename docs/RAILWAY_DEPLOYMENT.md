# Railway Deployment

Target topology: one Railway project with five components.

| Component | Type | Notes |
| --- | --- | --- |
| `api` | service (Dockerfile) | dashboard + REST + OAuth callback |
| `worker` | service (Dockerfile) | pipeline + schedules; has the media volume |
| Postgres | Railway plugin | managed database |
| Redis | Railway plugin | BullMQ queues |
| volume | Railway volume | mounted on `worker` at `/data/media` |

## 1. Create the project and databases

1. railway.app → New Project.
2. Add **PostgreSQL** and **Redis** from the plugin catalog. Railway exposes
   `DATABASE_URL` and `REDIS_URL` reference variables.

## 2. Create the two services from the repo

For each of `api` and `worker`:

1. New Service → GitHub Repo → select this repository, branch `main`
   (or `rebuild-v2` for staging).
2. Service settings → Build → set the Dockerfile path variable:
   - api: `RAILWAY_DOCKERFILE_PATH=docker/api.Dockerfile`
   - worker: `RAILWAY_DOCKERFILE_PATH=docker/worker.Dockerfile`
3. Worker settings → Volumes → attach a volume mounted at `/data/media`.
4. api settings → Networking → Generate Domain (this is your dashboard URL).
5. Healthchecks: path `/api/healthz` for api, `/healthz` for worker.

## 3. Variables

Set on **both** services (Shared Variables work well):

```
DATABASE_URL   = ${{Postgres.DATABASE_URL}}
REDIS_URL      = ${{Redis.REDIS_URL}}
APP_ENCRYPTION_KEY = <64 hex chars — generate once, never rotate casually>
SESSION_SECRET     = <random string>
ADMIN_EMAIL        = you@example.com
ADMIN_PASSWORD     = <strong password — hashed at seed time>
PUBLISH_MODE       = autonomous
MAX_PUBLISHES_PER_DAY = 1
EMERGENCY_PAUSE    = false
TEST_MODE          = false
NODE_ENV           = production
```

api only:

```
APP_PORT   = 3000
PUBLIC_URL = https://<your-api-domain>       # exact, no trailing slash
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET      # docs/GOOGLE_YOUTUBE_OAUTH.md
OPENAI_API_KEY / ELEVENLABS_API_KEY          # docs/AI_PROVIDERS.md
WORKER_INTERNAL_URL = http://worker.railway.internal:3000
# ^ private-network URL of the worker; the API proxies artifact previews
#   (video/thumbnail) from the worker's volume through this, authenticated
#   with an HMAC of SESSION_SECRET.
```

worker only:

```
APP_PORT   = 3000            # health endpoint port
MEDIA_ROOT = /data/media     # the mounted volume
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
OPENAI_API_KEY / ELEVENLABS_API_KEY
PUBLIC_URL = https://<your-api-domain>       # used for OAuth client redirect URI
```

Both services validate their environment at boot and crash-loop with a
readable error if something is missing — check Deploy Logs first.

## 4. Migrations and seeding

The api container runs `prisma migrate deploy` + the idempotent seed on
every boot, so schema changes ship with deploys. To run one manually:
service → Settings → one-off command
`node_modules/.bin/prisma migrate deploy --schema packages/db/prisma/schema.prisma`.

## 5. First-boot checklist (staging canary)

1. Deploy both services with `TEST_MODE=true` and `EMERGENCY_PAUSE=false`.
2. Open the dashboard, sign in with ADMIN_EMAIL/ADMIN_PASSWORD.
3. Start a run for `metformin`; watch it reach PUBLISHED with a `TEST…`
   video id (fake client — no real YouTube involved).
4. Flip `TEST_MODE=false`, add real provider keys, connect YouTube via
   Settings, and set the channel to **supervised** for the first real
   video. Approve script and upload by hand; confirm the private upload on
   YouTube Studio; publish from the dashboard.
5. Only then switch the channel to autonomous.

## 6. Scaling and constraints

- Keep the worker at **one replica**. Renders are CPU-bound and the media
  volume is single-writer. BullMQ prevents duplicate job processing across
  replicas, but the volume does not move with them. Multi-worker requires
  the S3/R2 artifact store (interface is ready in `ArtifactStore`).
- The api service is stateless; scale replicas freely.
- Give the worker ≥2 vCPU / 4GB for comfortable 1080p renders.

## 7. Rollback

Railway keeps previous deploys: service → Deployments → Redeploy the last
good build. Database migrations are additive; a rollback of app code
against a newer schema is safe for this schema (no destructive migrations
without a documented plan in the PR).

## 8. Monitoring

- Healthchecks: `/api/healthz` (db + redis), worker `/healthz`
  (db + redis + queue counts).
- Set a Railway alert on deploy failure and on healthcheck failure.
- The runbook (`docs/OPERATIONS_RUNBOOK.md`) covers queue recovery,
  duplicate prevention, and the emergency pause.
