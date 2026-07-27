# Local Development

## Prerequisites

- Node.js ≥ 22 and pnpm 9 (`corepack enable`)
- PostgreSQL 14+ and Redis 6+
- FFmpeg (with libx264 + drawtext/freetype) and ffprobe
- DejaVu fonts (Linux: `fonts-dejavu`; macOS ships suitable fonts but the
  render/thumbnail font paths point at DejaVu — install it or adjust
  `packages/media/src/ffmpeg.ts`)
- `espeak-ng` — only needed for TEST_MODE narration

Ubuntu/Debian: `sudo apt install postgresql redis-server ffmpeg fonts-dejavu espeak-ng`
macOS: `brew install postgresql redis ffmpeg espeak-ng`

## First-time setup

```bash
pnpm install

# database + user (adjust to taste)
sudo -u postgres psql -c "CREATE USER yva WITH PASSWORD 'yva_dev' CREATEDB;" \
                     -c "CREATE DATABASE yva OWNER yva;"

cp .env.example .env
# Set: DATABASE_URL, REDIS_URL
# Generate APP_ENCRYPTION_KEY:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Generate SESSION_SECRET the same way; pick ADMIN_EMAIL / ADMIN_PASSWORD.
# For key-free development set TEST_MODE=true.

pnpm db:migrate      # prisma migrate dev
pnpm build           # builds all packages and apps (tsc + vite)
pnpm db:seed         # admin user + "MedExplained" channel
```

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm build` | build everything (nx orchestrates package order) |
| `pnpm dev:api` | build + run the API on :3000 (serves the dashboard build) |
| `pnpm dev:worker` | build + run the pipeline worker (health on APP_PORT) |
| `pnpm dev:web` | Vite dev server on :5173 proxying /api → :3000 |
| `pnpm test` | run every package's test suite |
| `pnpm e2e:pipeline [medication]` | full in-process pipeline run |
| `pnpm db:migrate` | create/apply a dev migration after schema changes |

Run API and worker with different `APP_PORT`s if both run locally
(e.g. worker `APP_PORT=3001`).

## The test-mode rehearsal

```bash
TEST_MODE=true pnpm e2e:pipeline metformin
```

drives research → script → review → storyboard → assets → render → QC →
approval → upload → publish entirely in-process and prints a JSON summary
(final state, artifact list, fake video id). Artifacts land in
`MEDIA_ROOT/runs/<runId>/` — open `video.mp4` to watch the result.

Real FDA/NIH APIs are used for research even in test mode, so expect a few
seconds of network time; everything else is offline.

## Debugging

- Logs are structured JSON (pino). Pipe through `npx pino-pretty` for
  humans: `pnpm dev:worker | npx pino-pretty`.
- Every step writes `JobEvent` rows — the run detail page shows attempts,
  durations, and error text.
- A FAILED run keeps `failureReason` and a `retryTargetState`; fix the
  cause and press Retry in the dashboard (or POST `/api/runs/:id/retry`).
- Renders leave `render-work/` inside the run directory only on failure —
  inspect the per-scene clips there.
- Queue introspection: `redis-cli keys 'bull:pipeline:*'`, or the queue
  counts on the dashboard.

## Repo conventions

- TypeScript strict everywhere; CommonJS backend, tsc builds, no transpile
  magic in production.
- Zod at every boundary: env, provider responses, script/storyboard JSON,
  API bodies.
- No placeholder success: if a step can't produce a real validated
  artifact, it throws — that is a feature, not a bug to "fix" with
  fallbacks.
