# Content Pipeline

Each step is a queue job; each has an entry state, produces validated
artifacts, and either advances the run or fails it with a reason and a
retry target. Code: `apps/worker/src/pipeline/`.

## 1. research (RESEARCHING → SCRIPTING)

`gatherEvidence(medication)` (packages/research):

1. RxNorm normalizes the query ("glucophage" → metformin, rxcui).
2. openFDA finds the richest single-ingredient FDA label; extracts
   sections (indications, mechanism_of_action, dosage, adverse_reactions,
   drug_interactions, boxed_warning, …).
3. A brand/manufacturer sweep across labels for the same generic.
4. MedlinePlus Connect adds NIH's plain-language summary.
5. Every section becomes an `EvidenceSource` with id, URL, and verbatim
   excerpt. Saved as `evidence.json` (artifact `evidence_json`).

Only FDA/NIH domains can appear in the bundle — this is the channel's
sourcing policy in code.

## 2. script (SCRIPTING → SCRIPT_REVIEW)

The text provider gets the channel voice (warm nurse-explainer, ELI5
metaphors, no condescension), the brief, prior review failures (on
revision), and the full evidence bundle. It must return `ScriptSchema`
JSON: title, description, tags, hook, ≥4 sections (narration + claims with
sourceIds + visualIdea), outro, disclaimer. Structured-output validation
retries with the Zod errors fed back (bounded).

## 3. script_review (SCRIPT_REVIEW → STORYBOARDING | SCRIPTING | FAILED)

`reviewScript` (packages/shared/src/policy.ts) checks:

- every claim's sourceIds exist in the evidence bundle;
- claim density (≥1 cited claim per section);
- banned phrases ("completely safe", "miracle drug", anti-adherence, …);
- disclaimer covers education/doctor/pharmacist;
- **every numeric statistic in narration appears inside a cited claim** —
  the direct fix for v1's fabricated "90% of people" strings.

Fail → back to SCRIPTING with the failures in the next prompt (max 3
revisions, then FAILED). Pass → policy approval recorded; autonomous mode
continues, supervised mode waits for the human decision.

## 4. storyboard (STORYBOARDING → GENERATING_ASSETS)

The model splits the script into ≥6 scenes (exact narration coverage, image
prompt in the channel's visual style, optional ≤80-char caption). The code
then deterministically guarantees a hook scene opens and outro + spoken
disclaimer scenes close the video — a model omission can never drop the
medical disclaimer.

## 5. assets (GENERATING_ASSETS → RENDERING)

Per scene, idempotently (existing validated artifacts are skipped, so
retries never re-bill):

- narration mp3 (ElevenLabs → OpenAI TTS fallback), `validateAudio`;
- illustration png (OpenAI images), `validateImage`;

plus the thumbnail base image and the composed 1280x720 JPEG thumbnail
(<2MB, YouTube's limit). Every artifact is checksummed and recorded.

## 6. render (RENDERING → QUALITY_CHECK)

`renderLongform` (packages/media): per scene — cover-scale to frame, slow
6% Ken Burns push-in, caption drawtext, fades, narration audio with tail
padding; then concat into a single 1920x1080/30fps H.264+AAC MP4 with
`+faststart`. Scene durations feed `buildSrt` → `captions.srt`.

## 7. quality_check (QUALITY_CHECK → AWAITING_APPROVAL | FAILED)

`validateVideo`: file exists/size, mp4 container, h264+aac, exact
resolution, duration range, audio stream, sha256. The report is stored as
an artifact. Fail → FAILED (retry target RENDERING).

## 8. approval (AWAITING_APPROVAL → APPROVED | FAILED | wait)

- Emergency pause or channel pause → the run waits (resume scheduler
  re-enqueues it when unpaused).
- Supervised → waits for the dashboard's "Approve upload".
- Autonomous → `reviewQc` (resolution, audio, duration vs. target) is the
  approver; its verdict is recorded as a policy approval.

## 9. upload (APPROVED → UPLOADING_PRIVATE → UPLOADED_PRIVATE)

Preflight: validated `video.mp4` + thumbnail artifact paths (checksum/size
re-verified), script + evidence loaded, description composed **with the
FDA/NIH citation list and disclaimer appended**. Upload is a real file
stream (googleapis resumable transport), always `privacyStatus: private`,
`notifySubscribers: false`, then the thumbnail is set.

Idempotency: if a publication already has a video id, upload is skipped.
Reconciliation: if a previous attempt started but crashed ambiguously, the
channel is searched for an exact-title match before uploading again — the
duplicate-video guard.

## 10. publish decision + publish (UPLOADED_PRIVATE → SCHEDULED → PUBLISHED)

Autonomous: if the channel's `maxPublishesPerDay` quota has room, schedule
now; otherwise schedule tomorrow 15:00 UTC (delayed job). The publish step
re-checks quota and pause, flips privacy to public, **confirms via the API
that the video is actually public**, then records PUBLISHED and closes the
brief. Supervised: "Publish now" in the dashboard triggers the same step.

## 11. analytics_sync (repeatable)

For public videos: `videos.list` statistics snapshots into
`AnalyticsSnapshot`. No real videos → no rows. Nothing is ever simulated.

## Scheduling

`daily_brief` picks the next uncovered medication from the curated backlog
(`packages/research/src/topics.ts`), skips if ≥3 runs are in flight or the
system is paused, and starts a run. Operators can also start any medication
on demand from the dashboard.
