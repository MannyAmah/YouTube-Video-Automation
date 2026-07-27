# v2 Rebuild — Architecture Lessons (2026-07-27)

Compounded lessons from the v1 review and the v2 build, so they are never
relearned the hard way.

## 1. Placeholder success is the root failure mode

v1's production agent wrote `.info`/`.placeholder` files when TTS/images/
rendering failed and still marked the run `ready`, letting the publisher
queue simulated artifacts. v2's rule: **a step either produces a validated
artifact or throws.** Validation is structural (ffprobe, checksums, size
guards in ArtifactStore/upload preflight), so this cannot regress silently
— tests assert a text file named `.mp4` is rejected.

## 2. Facts must be traceable or absent

v1 templated statistics into scripts ("90% of people…"). v2 constrains the
model to an FDA/NIH evidence bundle and rejects any narration statistic
not covered by a cited claim (`reviewScript`). The same policy caught the
first test-mode script during the build (an uncited "5.0%" from label
text) — evidence the gate works and is not decorative.

## 3. State + optimistic transition beats clever orchestration

One `state` column, one transition table, and
`UPDATE … WHERE state = expected` gives crash-safety, duplicate-job
immunity, and replayable jobs with almost no machinery. Every step
re-checks its entry state; everything else (BullMQ retries, stalled-job
recovery, resume scheduler) can then be blunt.

## 4. Test mode must be a full rehearsal, not a stub

Fakes that produce *real files* (espeak speech, PNG cards, actual MP4s)
let the entire pipeline — including FFmpeg, QC, upload preflight, publish
policy — run keyless in CI. Fakes that return `{ok: true}` would have
hidden the concat-path bug (below) and the caption-timing issues.

## 5. Concrete bugs fixed during the build (regression notes)

- ffmpeg concat demuxer resolves relative entries against the *list
  file's* directory → concat lists must contain absolute paths.
- RxNorm brand names (Glucophage) resolve to a BN concept; walking
  `related.json?tty=IN` is required to reach the ingredient.
- Railway volumes attach to a single service → the API proxies artifact
  files from the worker (`/internal/artifacts/*`, HMAC-guarded) instead of
  assuming a shared filesystem.
- OpenAI images: `gpt-image-1` always returns b64 and rejects
  `response_format`; `dall-e-3` needs it — the adapter branches by model.
- BullMQ: completed jobs' ids linger (removeOnComplete age), so crash
  recovery cannot reuse the canonical jobId — recovery adds use an
  hour-bucketed id and rely on state guards for safety.

## 6. Autonomy is a policy layer, not an architecture

The pipeline is identical in autonomous and supervised modes; only the
approver differs (policy functions vs. dashboard actions), and both write
the same `Approval` audit rows. This made "fully autonomous" a safe
configuration choice on top of a supervised skeleton rather than a
separate riskier system.
