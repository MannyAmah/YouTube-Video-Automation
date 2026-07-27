# Testing

`pnpm test` runs every suite. Suites and what they prove:

| Suite | Location | Proves |
| --- | --- | --- |
| State machine | `packages/shared/test/states.test.ts` | happy path valid; approval gate cannot be skipped; terminal states final |
| Editorial policy | `packages/shared/test/policy.test.ts` | uncited statistics rejected (v1's fabrication bug), unknown sources rejected, banned phrases, disclaimer requirements; QC gate resolution/audio/duration |
| Crypto | `packages/shared/test/crypto.test.ts` | AES-GCM round-trip, tamper rejection, scrypt verify |
| Captions | `packages/media/test/captions.test.ts` | SRT structure, monotonic timing, wrapping |
| **Render integration** | `packages/media/test/render.test.ts` | a real 2-scene 1080p MP4 renders from fixtures and passes full ffprobe QC; a text file named `.mp4` is rejected (v1's placeholder bug) |
| Provider fakes | `packages/providers/test/fakes.test.ts` | test-mode script passes citation policy; fake YouTube enforces the same preconditions as the real client; per-run idempotent ids |
| **Live research** | `packages/research/test/evidence.test.ts` | real RxNorm/openFDA/MedlinePlus calls: brand→ingredient normalization, complete bundle, FDA/NIH-only URLs, loud failure for unknown drugs |
| DB state guard | `apps/worker/test/state-guard.test.ts` | against real Postgres: transition applies once; duplicates raise StaleRunStateError; concurrent identical transitions — exactly one wins |
| API integration | `apps/api/test/api.test.ts` | against the built app + real DB/Redis: healthz, **401 on every protected route**, login, cookie flags (HttpOnly, SameSite=Strict), invalid-state actions → 400 |

Requirements: local Postgres + Redis running, `.env` present (tests load it
via `tools/load-env.ts`), ffmpeg + espeak-ng installed, network access for
the live research suite. Build first (`pnpm build`) — the API suite runs
the compiled app.

## End-to-end pipeline (test mode)

```bash
TEST_MODE=true pnpm e2e:pipeline metformin
```

Full research→publish rehearsal with offline fakes; asserts a non-failed
terminal state and prints the artifact manifest. This is the release
verification gate and runs identically in CI (only research needs network).

## Queue-mode verification

The e2e driver runs steps in-process. To verify the real BullMQ path:

```bash
pnpm dev:worker &            # worker consuming queues
# then via API or dashboard:
curl -s -b cookies -X POST localhost:3000/api/runs \
  -H 'content-type: application/json' -d '{"medication":"lisinopril"}'
```

and watch the run advance through states in the dashboard.

## Live YouTube E2E (real keys — run once before real launch)

1. Railway staging with real `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`,
   Google OAuth, `TEST_MODE=false`, channel **supervised**.
2. Connect a dedicated **test channel** (never the production channel).
3. Start a run; approve the script; approve the upload.
4. Verify in YouTube Studio: the video exists, is **private**, thumbnail
   set, description carries FDA/NIH citations + disclaimer.
5. Publish from the dashboard; verify it flips to public and an analytics
   snapshot appears after the next sync.
6. Delete the test video from the channel.

## What is deliberately NOT tested with mocks

Analytics numbers, YouTube quota behaviour, provider billing. The system
records only real values for these; simulating them in tests would
reintroduce the exact class of fake data v2 exists to eliminate.
