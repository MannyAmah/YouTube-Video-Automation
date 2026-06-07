# Walking Skeleton — First-Run Verification

PLAN §9 Milestone 1. Honest account of what actually ran today vs what's placeholder
vs what's blocked on founder-supplied credentials. Generated 2026-06-07 on branch
`rebuild/v3-foundations`.

> **Headline:** the illustrator-independent render path is **proven** — a real
> 21-second 1080p MP4 was produced by the actual `motion_spec`→Remotion framework
> from placeholder PK/PD primitives. The safety guards (fail-closed disclaimer +
> placeholder-never-public) are implemented and unit-tested. The LLM/DB/publish
> stages are built but cannot RUN until the four founder-blocked items land.

---

## ✅ What actually ran (verified, with evidence)

### 1. Real video render through the real framework
```
$ remotion render src/index.ts DrugStoryVideo out/walking-skeleton.mp4
Rendered 630/630 · Encoded 630/630
+ out/walking-skeleton.mp4  1.2 MB   (ISO Media, MP4)
```
- 630 frames @ 30fps = **21s, 1920×1080**. Real headless Chromium render — works here.
- Drug = **Metoprolol**, chosen to span 4 PK/PD primitives accurately: oral
  **absorption → CYP2D6 first-pass → β1-receptor ANTAGONISM → renal clearance**.
- Composition = title card → one `MechanismScene` per beat (driven by its
  `motion_spec`) with caption → disclaimer card.
- Watchable copies: `~/Downloads/vitalis-walking-skeleton.mp4` and a still
  `~/Downloads/vitalis-frame-receptor.png`.
- The extracted frame shows the line-art receptor + docking ligand, the synced
  caption, **and the red `PLACEHOLDER · not RN-validated · unlisted-only`
  watermark** — the on-frame half of the safety guard.

### 2. Safety guards — fail-closed, unit-tested (no creds needed)
```
$ tsx --test src/youtube/publish.test.ts
✔ rejects empty disclaimer (fail-closed §6)
✔ rejects PUBLIC when assets are placeholder/unvalidated (§5.2)
✔ allows UNLISTED with placeholder assets + a disclaimer
✔ allows PUBLIC only when assets are all validated
ℹ tests 4 · pass 4 · fail 0
```
- `assertPublishAllowed()` is the boundary: **no disclaimer → throw**; **public +
  any placeholder asset → throw**. Placeholder art can only ever ship UNLISTED,
  so it can never reach the public §0.5 human-authorship gate.

### 3. Whole workspace typechecks clean
```
packages/shared typecheck: Done
packages/remotion typecheck: Done
packages/worker typecheck: Done
```

---

## 🟡 What's placeholder (by design — swaps out without pipeline change)
- **Visual assets:** the 4 PK/PD primitives are simple line-art SVG stand-ins
  (`validated:false`). Milestone 2 swaps them for illustrator-delivered,
  RN-validated art **behind the same `motion_spec` registry contract** — no
  pipeline change. Until then, every video is watermarked + unlisted-only.
- **Sample script/captions in the offline render:** standard, accurate pharmacology
  written into `sample.ts` to render without the LLM. In the live pipeline these
  come from the Script stage and are **fact-checked before render** (below).

---

## 🔴 Built but NOT yet run — blocked on founder credentials
These stages are implemented as real handlers (wired into the queue, typechecked)
but cannot execute without keys. They are **not stubs** — they're cred-gated:
- **Topic Scout** (`io.ts`) — seeds a drug/drug-class backlog spanning primitives.
- **Script** (`reasoning.ts`) — Claude → narrative beats + SSML. *Needs ANTHROPIC_API_KEY.*
- **Fact-Check + claim ledger** (`reasoning.ts`) — Claude extracts atomic claims,
  verifies against licensable sources, adversarially refutes, writes the `claims`
  ledger, and **halts the pipeline** if any high-risk/refuted claim isn't supported.
  *Needs ANTHROPIC_API_KEY.* **This is the moat and it runs before render/publish.**
- **Storyboard** (`reasoning.ts`) — beats → `motion_spec[]`, **validated at emit
  time** against each module's param schema (DoD B). *Needs ANTHROPIC_API_KEY.*
- **Render** (`io.ts`) — queue-driven Remotion render (the CLI path is proven above).
- **Review** (`io.ts`) — inserts into `review_queue` and **halts for the human gate**.
- **Publish** (`io.ts`) — guarded YouTube upload, **UNLISTED** for the first run.
  *Needs YouTube OAuth.* Writes `publish_log` with the disclaimer hash.
- All DB reads/writes — *need a live Supabase project (migration applied).*

---

## ⛔ FOUNDER-BLOCKED CHECKLIST (yours; can't be worked around)
The walking skeleton cannot make its first *end-to-end* unlisted video until:

1. **Merge PR #1** (the foundation + this skeleton land on `main`).
2. **API keys + hard per-provider spend ceilings** — Anthropic (LLM), ElevenLabs
   (TTS, Phase 2), image-gen. Set the ceiling per the §10 unit cost × volume
   (Hermes rule) so a runaway loop trips the cap, not the card.
3. **Supabase auth + cost confirm** — so the migration applies to a live DB. First
   `supabase db push` is **not done** until the anon read/write-denied test passes
   (DoD C) before any real data flows.
4. **Test YouTube channel + OAuth creds** — for the UNLISTED publish. Never a
   public/real channel for an integration test.

When 1–4 land, the sequence is: apply migration + run the anon-deny test →
set keys → run the queue end-to-end → produce ONE unlisted video → report it here
with the unlisted link, the fact-check ledger rows, and the live safety-gate evidence.

---

## Real vs placeholder vs blocked — one-glance table
| Pipeline element | State | Evidence |
|---|---|---|
| `motion_spec`→Remotion framework | ✅ real, ran | 630-frame MP4 |
| Placeholder PK/PD primitives | 🟡 placeholder (swap later) | watermarked frame |
| Video composition (title/beats/captions/disclaimer) | ✅ real, ran | MP4 |
| Disclaimer fail-closed | ✅ real, tested | guard test |
| Placeholder→never-public | ✅ real, tested | guard test |
| Fact-check + claim ledger | 🔴 built, needs Anthropic + DB | code + typecheck |
| Script / Storyboard / Metadata | 🔴 built, needs Anthropic | code + typecheck |
| Topic Scout / Review / Publish | 🔴 built, needs DB / YouTube | code + typecheck |
| RLS anon-deny behavior test (DoD C) | 🔴 needs live Supabase | — |
