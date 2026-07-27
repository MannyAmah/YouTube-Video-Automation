# MedExplained — Autonomous YouTube Medication-Education Platform (v2)

MedExplained researches, writes, illustrates, narrates, renders, uploads, and
publishes faceless educational YouTube videos that explain medications in
plain, friendly language — every factual claim traced to FDA/NIH sources.

Built by a nurse, for patients: most people take medications without knowing
what they do. This channel breaks each medication down to a five-year-old
level of understanding, visually, with an empathetic voice.

## What v2 is

A supervised-capable, **autonomous-by-default** content operations platform:

- **Research**: live evidence bundles from openFDA drug labels, DailyMed,
  MedlinePlus, and RxNorm — no keys required, no fabricated facts possible.
- **Script**: structured, section-by-section scripts where every factual
  claim carries citations into the evidence bundle, enforced by an automated
  editorial policy (uncited statistics are rejected — the exact failure mode
  that sank v1).
- **Storyboard → media**: scene illustrations (OpenAI images), warm narration
  (ElevenLabs, OpenAI TTS fallback), FFmpeg-rendered 1920x1080 MP4 with
  Ken Burns motion, burned captions, SRT file, and a composed thumbnail.
- **Quality gate**: ffprobe validation (codecs, resolution, duration, audio,
  checksum). Nothing that fails QC can be uploaded — placeholder files are
  structurally impossible to publish.
- **Publish**: real resumable upload as **private**, then autonomous
  publication within a daily quota — or human approval in supervised mode.
- **Analytics**: real YouTube metrics only; empty until real data exists.
- **Operations dashboard**: every run, artifact, script, citation, approval,
  and failure is visible; one-click emergency pause.

## Repository layout

```
apps/
  api/      NestJS REST API + serves the dashboard
  worker/   NestJS standalone pipeline worker (BullMQ)
  web/      React + Vite + Tailwind operations dashboard
packages/
  shared/   env contract, state machine, schemas, editorial policy, crypto
  db/       Prisma schema/migrations, artifact store, race-safe transitions
  research/ FDA/NIH clients (openFDA, RxNorm, MedlinePlus, DailyMed)
  providers/OpenAI, ElevenLabs, YouTube clients + offline test-mode fakes
  media/    FFmpeg render, ffprobe validation, captions, thumbnails
docker/     Railway Dockerfiles (api, worker)
docs/       full documentation set (see below)
legacy/     the v1 prototype, kept for reference — not deployed
```

## Quick start (local)

Prerequisites: Node 22+, pnpm 9, PostgreSQL, Redis, FFmpeg
(plus `espeak-ng` for test mode). See `docs/LOCAL_DEVELOPMENT.md`.

```bash
pnpm install
cp .env.example .env          # fill in DATABASE_URL, REDIS_URL, secrets
pnpm db:migrate               # create schema
pnpm build                    # build all packages/apps
pnpm db:seed                  # admin user + default channel
TEST_MODE=true pnpm e2e:pipeline metformin   # full offline pipeline rehearsal
pnpm dev:api                  # dashboard at http://localhost:3000
pnpm dev:worker               # start the pipeline worker
```

With `TEST_MODE=true` the entire pipeline runs with **zero paid keys**:
research hits the real FDA/NIH APIs, media is produced by offline fakes
(real speech via espeak, real PNGs, real MP4s), and uploads go to a fake
YouTube client that can never reach a real channel.

## Documentation

| Doc | Contents |
| --- | --- |
| `docs/ARCHITECTURE.md` | services, data flow, state machine |
| `docs/CONTENT_PIPELINE.md` | every pipeline step in detail |
| `docs/LOCAL_DEVELOPMENT.md` | setup, commands, fixtures, debugging |
| `docs/RAILWAY_DEPLOYMENT.md` | full Railway deployment walkthrough |
| `docs/GOOGLE_YOUTUBE_OAUTH.md` | Google Cloud + YouTube OAuth setup |
| `docs/AI_PROVIDERS.md` | OpenAI / ElevenLabs configuration |
| `docs/SECURITY.md` | secrets, token encryption, threat model |
| `docs/OPERATIONS_RUNBOOK.md` | pause, recovery, failure playbooks |
| `docs/API.md` | endpoint contracts |
| `docs/TESTING.md` | test suites and live-test procedure |
| `docs/TROUBLESHOOTING.md` | common failures and fixes |

## Safety posture

Autonomous publishing is the configured default (product decision), with
these non-negotiable backstops: uploads are always private-first; publishing
respects a daily quota; a global emergency pause halts everything; the mode
can be flipped to supervised per channel at any time; and no artifact that
fails validation can ever reach YouTube. Health content carries real policy
risk — the citation ledger and editorial policy exist to keep every claim
defensible.

## License

MIT — see `LICENSE`.
