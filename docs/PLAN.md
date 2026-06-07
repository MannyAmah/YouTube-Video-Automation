# Vitalis — Clinician-Authored Medical Education YouTube Channel

**Working title:** *Vitalis* (placeholder — see §2.1 for naming)
**Owner:** Emmanuel (RN). *Standalone educational project — not affiliated with any company.*
**Repo (host):** https://github.com/MannyAmah/YouTube-Video-Automation
**Status:** Plan **v3.2** — founder axis correction (2026-06-07). Organizing axis is now **drugs / mechanisms**, disease is *context*; the "wedge" is a **PK/PD primitive set**, not a disease cohort (§1, §2.2, §2.4, §5.3, §9). Standalone project — company references removed. Phase 0 **GO**; PR #1 still cleared.
**Positioning:** *Clinician-authored at scale* — automated production, real RN authorship in every artifact. (Not "100% automated" — see §0.5.)
**Last updated:** 2026-06-07

> **v3.2 changelog (founder axis correction):** Reframed the organizing axis from disease to **drug/mechanism** — drug is the recurring unit, disease is context (§1). Pillars reworked: retired "Disease as a Siege", added "How It's Made" (drug-development lifecycle), "What Changes the Dose" (PK/PD modifiers) (§2.2). Topic backlog now seeded by **drug/drug-class taxonomy**, conditions as metadata (§2.4). The launch wedge is now the **universal PK/PD primitive set** (ADME path + 4 target-interaction archetypes), not a disease cohort; launch drugs deliberately *span* mechanisms (§5.3, §9). Removed all company references; this is a standalone educational project (§1 — §0.5 authorship/monetization logic is independent and unchanged).
>
> **v3 changelog (second Checker pass):** Resolved the **authoring-hours bottleneck** (§2.3 — cadence gated by RN throughput via 3–5 min voice-memo capture; honest cadence, not daily-long-form); scoped the **asset library as a real production workstream** (§5.3 build plan + composable primitives + a narrow launch wedge); rebuilt §9 roadmap into parallel software/library tracks; added **§10.3 library labor cost** (no longer hidden as ~$0); reframed the voice clone as **necessary-not-sufficient** + real→clone soft launch + synthetic-disclosure verify (§0.5/§2.1); cleaned the leftover **HIPAA/BAA framing** from the §4 stack table.
>
> **v2 changelog (first Checker pass):** Added §0.5 monetization viability; resolved the §5 illustration fork (parametric library, not raster Ken-Burns); retargeted §1 threat model (FTC/YouTube/RN-scope, not HIPAA); per-video unit-cost + Remotion Lambda (§10); monetization + ad-suitability risks (§12); RAG corpus licensing note (§6); de-rubber-stamped §13 Q4 + §14.

---

## 0. The locked decisions

These four calls were made by the founder and define the architecture. Everything below assumes them.

| Decision | Choice | Architectural consequence |
|---|---|---|
| **Autonomy** | Auto-generate → **human-approve** gate before publish | Pipeline runs end-to-end into a Supabase review queue; a Telegram/dashboard tap publishes. A medical fact-check + citation gate runs *before* the human ever sees it. |
| **Budget** | **Premium (~$1.5–2.5k/mo)** | ElevenLabs (founder-cloned voice), Remotion motion graphics, a curated/parametric anatomical asset library; Flux/Ideogram for *non-anatomical* texture only. Revised up from $1k after §10 unit-cost rebuild. |
| **Visual style** | **Animated motion graphics from a parametric asset library** | Biological processes (drug→receptor binding, immune response, pathophysiology) animated programmatically in **Remotion** from validated vector/parametric assets driven by `motion_spec` JSON. **Not** Ken-Burns over generated stills. See §5. |
| **Hosting** | **Railway worker + Supabase + Vercel** | Long-running Railway worker owns the heavy render pipeline; Supabase is state/queue/asset store; Vercel hosts the review dashboard. Remotion Lambda is the scale path at daily cadence (§10). |

---

## 0.5 Platform & monetization viability (first-class concern)

The fact-check layer (§6) protects against **content removal** (misinformation policy). This section protects against the *other* existential risk the v1 plan ignored: **demonetization**. They are different audits and we now build for both.

**The threat.** YouTube's 2025 "inauthentic content" monetization rules make mass-produced, templated AI content that lacks the creator's *original, authentic insight* ineligible for monetization. A daily-cadence, single-synthetic-voice, templated-pillar, AI-narrated medical channel is close to the textbook profile YouTube now demonetizes. Separately, advertiser-friendly guidelines limit or disallow ads on "harmful health/medical claims," and graphic clinical imagery (injections, surgery, wounds) is ad-restricted. The v1 framing made this worse by branding the channel "100% automated" with "done = founder taps approve" — that is the rubber-stamp pattern. **Killed.**

**The resolution — clinician-authored at scale.** Emmanuel's RN authorship must be present *in the artifact*, not just in the approval tap. The load-bearing elements are #1 (perspective) and #2 (proprietary visuals); the voice clone (#3) is **necessary but not sufficient** — YouTube's "original insight" bar is about *substance and perspective*, not whose timbre narrates:
1. **Per-video clinical commentary — THE primary signal.** Each script carries ≥1 original RN-perspective segment — "what I tell patients about this," a clinical caveat, an experiential framing — authored by Emmanuel. Low-friction capture: a 3–5 min voice memo per video, transcribed into the segment (see §2.3), logged in the claim ledger as documented original insight. This is the unfakeable trust signal and the real cadence constraint.
2. **Visual originality.** The parametric anatomical library (§5) is a proprietary, hand-validated asset system — not generic AI templates — itself a strong authorship/originality signal. (Build cost is a real workstream — see §5.3 + §9.)
3. **Voice = the founder's own voice** — recorded for real on soft-launch videos, then cloned (ElevenLabs Professional Voice Clone) for scale. Real → clone, never stock → clone. Supports authenticity but doesn't carry it alone.
4. **Ad-suitability gate.** A pre-publish check flags graphic clinical imagery and reframes/abstracts it (stylized line-art, not photoreal surgery) to stay advertiser-friendly; high-claim segments get hedged framing.

**Synthetic-media disclosure (verify, don't assume).** Cloning Emmanuel's *own* voice with his consent is very likely fine and below YouTube's "realistic altered/synthetic" disclosure threshold for one's own likeness — but this must be **verified against current YouTube policy before the clone goes live**, not assumed. Soft-launch real narration sidesteps the question entirely during the highest-scrutiny window.

**Consequence for cadence.** Full human review is **permanent** for medical content (see §13 Q4) — it does not "graduate to sampling." What scales with channel standing + monetization health is *volume*, not *oversight* — and volume is itself capped by RN authoring throughput (§2.3), not compute.

---

## 1. Vision & thesis

A **clinician-authored, automated-production** YouTube channel whose organizing axis is **drugs and their mechanisms** — how a drug works, end to end, visualized. The recurring unit is the **drug**; disease is *context*, not the bucket. The arc a video can trace: development (discovery → preclinical → trial phases → approval) → human use → **pharmacokinetics / ADME** (how the body processes it) → modifying factors (pharmacogenomics, interactions, organ function, age) → **pharmacodynamics** (mechanism of action) → diagnoses *as context* → side/adverse effects → on- and off-label uses → relevant procedures/"non-treatments". The pipeline is fully automated; the *authorship* is human (an RN). Each video makes abstract pharmacology *visualizable and relatable to real human biology*.

**Why this can win (the wedge):** Medical YouTube is either (a) dry lecture slides (Osmosis, Ninja Nerd — great but academic) or (b) shallow "5 facts" listicles. Almost nobody does **story-driven, cinematic, mechanistically faithful motion graphics** of how drugs actually move through and act on the body. The founder is a **registered nurse (BSN, MS Health Informatics, 8 yrs clinical)** — that clinical authority is the moat: it lets us run a fact-check layer with real rigor and build trust signals competitors can't fake.

**Non-negotiable — and aimed at the right audit.** There is **no PHI here** (synthetic patient personas, public medical facts), so HIPAA/BAA is *not* the governing frame — invoking it in v1 showed the safety design pointed at the wrong audit. The real exposures are:
1. **FTC health-claim rules** — sharpest at Phase 5 paid ads; substantiation required for any health benefit/efficacy claim.
2. **YouTube medical-misinformation + advertiser-friendly policy** — content removal *and* demonetization (§0.5, §6).
3. **Professional scope / RN licensing-board considerations** — Emmanuel publishes on meds/diseases as an identifiable licensed nurse; content stays educational, never individualized advice, with consistent disclaimers, to protect his license.

The fact-check layer (§6) is not optional polish — it is core product, scoped to *these* risks.

---

## 2. Channel strategy

### 2.1 Brand & naming
- Name candidates: *Microdose* (drug-focused), *Pathways* (mechanism-focused), *Vitalis*, *Inside the Body*. With the drug/mechanism spine (§1), the **drug-/mechanism-flavored names (*Microdose*, *Pathways*) now fit best** — disease-flavored options are demoted. **Decision deferred** — quick `/office-hours` naming pass + trademark/handle availability check before launch.
- Persona: warm, authoritative narrator ("your nurse who actually explains it"). **The voice is Emmanuel's own** — recorded for real on the soft-launch videos, then cloned (ElevenLabs Professional Voice Clone) for scale (real → clone, never stock → clone; §0.5). One locked voice = brand consistency, and it's genuinely him. The clone is necessary-not-sufficient — the authenticity load is carried by his per-video commentary (§0.5 #1).
- One recurring visual mascot is optional. The Xiaohei repo's lesson (§5) is *style DNA over templates* — we adopt a consistent **line-art-meets-anatomical** look, not a literal character.

### 2.2 Content pillars (the format menu) — drug/mechanism spine
1. **"A Drug's Journey"** — follow a drug mouth → bloodstream → target → effect → elimination (the full ADME/PK arc as a story). *e.g. "What metformin actually does once you swallow it."*
2. **"How It's Made"** — the drug-development lifecycle: discovery → preclinical → trial phases I–III → approval → post-market. Demystifies where drugs come from (a gap competitors ignore). *e.g. "How a molecule becomes a medicine."*
3. **"Inside the Cell" (Mechanism of Action)** — pharmacodynamics deep-dives: receptor agonism/antagonism, enzyme inhibition, transporter/ion-channel blockade, signaling cascades.
4. **"What Changes the Dose"** — modifying factors: pharmacogenomics, drug–drug interactions, organ (hepatic/renal) function, age. Why the same drug behaves differently in different bodies.
5. **"On-Label, Off-Label & Adverse Effects"** — indications (incl. off-label), side/adverse effects, with diagnoses as *context* for why the drug is used. *e.g. "The off-label lives of a beta-blocker."*

> Disease is **context inside these pillars**, never the bucket. The old "Disease as a Siege" framing is retired; pathophysiology appears only to explain why a drug acts where it does.

### 2.3 Cadence & formats — gated by RN authoring throughput, not compute

The §0.5 authenticity shield makes **Emmanuel's per-video original commentary the true cadence constraint** — not render compute. One RN cannot add genuine clinical perspective to a daily long-form without diluting the exact signal that keeps the channel monetizable. So cadence is set by *honest one-RN throughput*, with a low-friction capture mechanism to make each video cost minutes, not an editing session:

- **Capture mechanism (the lever):** for each video the pipeline sends Emmanuel a **3–5 min voice-memo prompt** ("your clinical take on X") via Telegram; it's transcribed and woven into the commentary segment + claim ledger. Per-video human load = minutes, not an hour. This is what makes any cadence above "a couple a week" honest.
- **Phase 1 (soft launch):** Emmanuel records **real full narration** for the first 5–10 videos (see §0.5 / voice note) — ~2/week. Max authenticity during the zero-history scrutiny window; doubles as clone training audio.
- **Phase 2 (cloned voice + memo capture live):** **3–4 long-form/week + daily Shorts.** Long-form is RN-commentary-gated; Shorts repurpose approved long-form beats (the original perspective already exists in the parent), so they scale further without new authoring load.
- **Scale path beyond one RN:** a small pool of **credentialed contributors** (attributed) raises the ceiling — added only once the pipeline + library prove out. *Not* a Phase 1/2 dependency.
- Shorts are first-class: the discovery engine and the bridge to TikTok/Reels (§11).

> **Cadence honesty rule:** never raise cadence by shortening or faking commentary. If authoring throughput is the limit, cadence drops — the signal is the product (§0.5).

### 2.4 Topic sourcing — drug/drug-class taxonomy as the spine
- Trend signal: YouTube Data API search-volume + Google Trends + "most prescribed drugs" / high-search drug lists.
- Backlog seeded from a curated **drug / drug-class taxonomy** (top prescribed + high-search drugs) stored in Supabase, scored by search demand × competition gap × evergreen value. **Conditions are metadata on a drug** (what it treats), not a separate axis.
- Topic eligibility is also gated by **mechanism-primitive coverage** (§5.3): a drug is producible once the library has the ADME + target-interaction primitives its story needs.
- A `/loop`-driven **Topic Scout** agent refreshes and re-ranks the backlog weekly.

---

## 3. System architecture

### 3.1 The pipeline (stage-by-stage)

```
                         ┌─────────────────────────────────────────────┐
                         │  Supabase: topics · scripts · assets · queue │
                         │           jobs · publish_log · metrics       │
                         └─────────────────────────────────────────────┘
                                            ▲  ▲
        ┌───────────────────────────────────┘  └──────────────────────────────┐
        │                       RAILWAY WORKER (orchestrator)                   │
        │                                                                       │
  ① TOPIC SCOUT ─▶ ② SCRIPT WRITER ─▶ ③ MEDICAL FACT-CHECK ─▶ ④ STORYBOARD     │
   trend+backlog     story + teaching     citations + claims      shot list +    │
   re-rank           beats + SSML         verification gate       motion specs   │
                                                  │ (fail → revise loop)         │
        ┌─────────────────────────────────────────┘                            │
        ▼                                                                       │
  ⑤ ASSET GEN (parallel fan-out)                                                │
   ├─ voiceover (ElevenLabs, founder-cloned voice, per-beat)                    │
   ├─ scene assembly: bind motion_spec → parametric anatomical assets (lib)     │
   ├─ texture/background only (Flux/Ideogram — NEVER the mechanism diagram)     │
   └─ captions/SRT (forced alignment)                                          │
        ▼                                                                       │
  ⑥ VIDEO RENDER (Remotion scenes from motion_spec, on Railway → Lambda)        │
   render parametric Remotion scenes + VO + music + captions → MP4              │
        ▼                                                                       │
  ⑦ METADATA + THUMBNAIL                                                        │
   title/description/tags/chapters (SEO) + thumbnail variants + disclaimer      │
        ▼                                                                       │
  ⑧ REVIEW QUEUE ──▶ [HUMAN APPROVE via Telegram/Vercel dashboard]              │
        ▼                                                                       │
  ⑨ PUBLISH (YouTube Data API v3) ─▶ ⑩ ANALYTICS LOOP ─▶ feeds ① re-ranking     │
        └───────────────────────────────────────────────────────────────────────┘
```

### 3.2 Why a job-queue, not a monolith
Each stage is an idempotent **job** with state in Supabase (`queued → running → done/failed`), so:
- Any stage can retry independently (TTS rate-limited? re-run just ⑤-voice).
- Heavy render (⑥) runs on the Railway worker without blocking lighter stages.
- The human gate (⑧) is just a job state transition (`pending_review → approved`).
- Full audit trail of every claim, citation, and asset per video (compliance §6).

### 3.3 Data model (Supabase / Postgres + pgvector)
- `topics` — taxonomy, demand score, competition score, status, pillar.
- `videos` — one row per video; FKs to script, assets, render, publish.
- `scripts` — beats (JSON), SSML, word count, reading level.
- `claims` — every medical assertion, its source citation(s), verification status, risk tier. **This is the compliance ledger.**
- `assets` — voiceover/image/motion/caption files (Supabase Storage URLs), per beat.
- `jobs` — the queue: stage, status, attempts, logs, error.
- `review_queue` — pending human approval, with checklist results.
- `publish_log` — YouTube video id, publish time, disclaimer hash.
- `metrics` — pulled from YouTube Analytics; feeds topic re-ranking.
- RLS on everything; service-role key only on the Railway worker.

---

## 4. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Orchestrator | **Node.js 20 + TypeScript** worker on Railway | Long-running, owns the queue loop + FFmpeg/Remotion. Strict mode, no `any`. |
| Queue/state | **Supabase** (Postgres 15 + pgvector + Storage + RLS) | Single source of truth. pgvector for semantic dedupe of topics/claims. |
| Dashboard | **Next.js 14 (App Router) + Tailwind + shadcn/ui** on Vercel | Review queue, approve/reject, analytics, manual topic injection. |
| Scripting/reasoning agents | **Claude (Opus for fact-check/script, Sonnet for fast metadata)** via Anthropic SDK | Best reasoning for the fact-check layer (§6). (No PHI flows here — see §1; HIPAA/BAA is not the governing frame.) |
| TTS | **ElevenLabs** | Founder's own voice (real → cloned, §0.5). SSML per beat. |
| Image gen | **Flux / Ideogram** (primary), DALL·E 3 fallback | **Non-anatomical backgrounds/texture only** — never load-bearing mechanism diagrams (those come from the parametric library, §5). |
| Motion/video | **Remotion** (React-based programmatic video) + **FFmpeg** | Renders parametric library scenes from `motion_spec`; captions, audio mux. Remotion Lambda at scale (§10). |
| AI B-roll (optional) | **Runway / Kling** | Only for premium cinematic inserts; tightly scoped, never for factual diagrams. |
| Embeddings | OpenAI `text-embedding-3` | Topic/claim dedupe + retrieval over a medical knowledge base. |
| Approval gateway | **Telegram** (founder DM) + dashboard | Reuses the Hermes-style always-on pattern from global CLAUDE.md. |
| CI/CD | GitHub Actions → Railway/Vercel deploy on merge to main, manual prod gate | Per Iron Law: never push to main directly; `/ship` via PR. |

**Improvements over the reference `youtube-automation-agent`** (brief said "improve on this"):
1. It has *no real video assembly or TTS* — we add full Remotion render + ElevenLabs.
2. It auto-publishes with no safety layer — we add the **medical fact-check + claim ledger + human gate**.
3. It's a sequential monolith — we use a **resumable job queue** (retry/parallel/audit).
4. It's stateless local — we use **Supabase** for durable state, dedupe, and analytics feedback loop.

---

## 5. The visual system (translating Xiaohei → English medical illustration)

The `ian-xiaohei-illustrations` repo is a **Codex skill** for Chinese articles. We extract its *principles*, translate all guidance to English, and adapt to medical motion graphics:

**Adopted principles:**
- **Cognitive anchors, not decoration** — illustrate the *mechanism* (the receptor, the cascade), not generic stock-art bodies.
- **Style DNA over templates** — a recognizable, consistent look (clean line-art base + selective anatomical color, white space) rather than copied compositions. Reinvent the metaphor each video.
- **Shot list discipline** — 1 storyboard with 8–16 shots per long-form, each tagged with a structural pattern (process flow / before-after / cross-section / signaling cascade / siege).
- **QA checklist for visual consistency** — automated style-conformance check before render.

### 5.1 The resolved fork — parametric library, NOT raster generation

The v1 plan had an internal contradiction: §0 promised "animated motion graphics, not slideshow," but the asset pipeline generated flat Flux/Ideogram frames and applied Ken-Burns motion. **Ken-Burns over a generated still is a slideshow with a zoom** — you cannot keyframe accurate ion flux or drug-receptor docking out of a static raster frame, and an LLM "checking" whether a generated heart has four chambers is hallucination checking hallucination. Resolved decisively:

| Path | Use | Why |
|---|---|---|
| **Parametric / curated anatomical asset library** (vector + Remotion components, hand-validated) | **All load-bearing mechanism diagrams** — anatomy, receptors, cascades, pharmacokinetics | Physiological *fidelity*, cross-video *consistency*, and the Xiaohei "style-DNA" goal in one. Assets are built once, validated by a clinician, reused. Motion is real because the asset is parametric — `motion_spec` drives actual geometry (a channel opens, a ligand docks), not a pan over a picture. |
| **Flux / Ideogram (raster gen)** | **Non-anatomical only** — backgrounds, textures, ambient establishing shots, stylized patient-environment scenes | Allowed where factual accuracy isn't load-bearing. **Never** the mechanism diagram. |
| **Runway / Kling (AI video)** | Optional cinematic B-roll inserts | Tightly scoped, never factual diagrams. |

**The asset library is itself the moat and an originality signal (§0.5):** a proprietary, growing set of validated, on-brand anatomical primitives (cells, organs, receptors, drug molecules, immune actors) that competitors can't cheaply replicate and that YouTube can't flag as "generic templates."

### 5.2 Adapted aesthetic & accuracy guardrail
- Base aesthetic: **anatomical line-art on near-white, with restrained physiological color accents** (arterial red, venous blue, neural gold). Inherits Xiaohei's clarity; distinct from its stark silhouette.
- Each shot = a **Remotion scene** rendered from `motion_spec` JSON the Storyboard agent emits, composed from library assets with declared motion (channel opening, ligand docking, cascade firing).
- Locked **style guide** (`docs/STYLE.md`) governs both library assets and the (limited) raster-gen prompt prefix.
- **Accuracy guardrail is deterministic, not an LLM vision pass.** Three layers: (1) library assets are **pre-validated once** by the founder (RN) when added — correctness lives in the asset, not in per-render inference; (2) `motion_spec` is schema-validated against the asset's allowed parameters; (3) **human spot-check on any high-risk anatomy** at the §6 gate. A beautiful-but-wrong diagram is a defect — and the library design makes it structurally hard to produce one.

### 5.3 The library is a production workstream, not a template (build plan)

The deterministic-accuracy win has a price the v1/v2 cost model hid: **the library is a months-long medical-illustration production effort**, not the "one Remotion scene template" Phase 1 implies. You cannot animate drug-receptor docking for 200 drugs from one template. This reframes both scope and launch.

**The wedge is a PRIMITIVE SET, not a disease.** The narrowing axis is the **mechanism primitive**, not a condition cohort — which fits the drug/mechanism spine (§1) and the modules already scaffolded (agonism/inhibition/blockade are *pharmacological*, not disease, constructs). Rationale: **~every drug = {ADME path} × {target binding + downstream effect}**, so a small set of universal PK/PD primitives unlocks broad drug coverage immediately and maximizes reuse — which was the wedge's original purpose, now aimed at the right axis.

**Library architecture (composable primitives, not per-video art).** The unit of reuse is a *parametrized primitive*, so coverage compounds:
- **ADME-path primitives:** absorption; hepatic first-pass / **CYP450 metabolism**; distribution (incl. plasma-protein binding, blood–brain-barrier transit); renal clearance.
- **Target-interaction archetypes:** receptor agonist/antagonist, enzyme inhibition, transporter/ion-channel blockade, signal-transduction cascade.
- **Base primitives:** cells (generic + key types), organs/cross-sections, membranes, vessels, generic drug-molecule + ligand shapes.
- **Composition:** a video's scene is assembled from {ADME path} × {target-interaction archetype} configured by `motion_spec`. A new drug that reuses covered primitives ≈ near-zero new art; a genuinely new mechanism or organ system = real production work.

**Who builds & validates, at what rate.** A defined workstream, owned and budgeted (see §10.4):
1. A medical illustrator / motion designer (contract or PT) produces primitives + archetypes against `docs/STYLE.md`.
2. Emmanuel (RN) **validates each asset once** for physiological/pharmacological correctness before it enters the library (this *is* the accuracy guarantee, §5.2).
3. Target a **starter library = the universal PK/PD primitive set above** (ADME path + the 4 target-interaction archetypes + base primitives) before soft launch; expand as new mechanisms/organ systems are needed.

**Launch drugs EXERCISE the primitives, deliberately spanning mechanisms.** The first videos are chosen to stress-test the primitive set across *varied* drugs — different ADME paths and different target archetypes — **not** clustered in one disease. (e.g. an oral CYP450-metabolized enzyme inhibitor, a renally-cleared receptor antagonist, a transporter blocker — exemplars, not a cohort.) Coverage widens as primitives are added.
- §2.2 pillars stay; the *topic backlog* (§2.4) is filtered by "do the library primitives cover this drug's story yet?" — uncovered drugs queue behind primitive build, they don't force one-off art.

> **Coverage rule:** a drug is only eligible for production when the library has the ADME + target-interaction primitives to render its story accurately. No drug outruns the library.

---

## 6. Medical safety & compliance layer (the differentiator)

This is why we chose the human-approval gate. It runs **before** the review queue.

1. **Claim extraction** — the Fact-Check agent parses the script into atomic claims (dosages, mechanisms, indications, contraindications, statistics).
2. **Verification** — each claim is checked against a curated, retrievable knowledge base via RAG. Unsupported claims are flagged and sent to a revise loop. Adversarial second-pass: a separate agent tries to *refute* each claim.
   - **Corpus licensing (keep it clean):** ingest only sources we're licensed to retrieve over — **public/government** (DailyMed, FDA labels, NIH/MedlinePlus, PubMed *abstracts*) and **StatPearls (CC-BY, with attribution)**. General peer-reviewed full-text papers are **not** freely ingestible — for those we store *citations/links* and reason over the abstract, not the full text. The corpus's provenance + license is recorded per source.
3. **Risk tiering** — claims tagged `general` / `clinical` / `high-risk` (dosing, interactions, treatment recommendations). High-risk claims require a citation and stronger hedging language.
4. **Disclaimer injection** — every video gets a spoken + on-screen + description disclaimer: *"Educational only — not medical advice. Talk to your clinician."* Disclaimer hash logged.
5. **YouTube policy conformance** — automated check against medical-misinformation policy; avoid prohibited claims (cures, anti-vax, dangerous self-treatment).
6. **The claim ledger** (`claims` table) = a permanent, auditable record of every assertion and its source per video. This is the founder's clinical-authority moat made into infrastructure.
7. **Human gate** — founder (RN) sees: script, storyboard, the flagged-claims report, and the rendered draft. Approve / request-revision / reject, from Telegram or dashboard.

---

## 7. Autonomy & orchestration

- **Railway worker** runs a continuous queue loop (claim jobs → process → advance state). Heavy renders run here.
- **Schedules** (Railway cron / Supabase scheduled functions):
  - Topic Scout re-rank — weekly.
  - Generation kickoff — daily (enqueue N videos to keep the review queue stocked).
  - Analytics pull — daily (YouTube Analytics → `metrics` → re-rank).
  - Scheduled publish — approved videos publish at optimal times.
- **Approval gateway:** Telegram bot DMs the founder when a video hits `pending_review` with a thumbnail, the flagged-claims summary, and a watch link → inline Approve/Reject buttons. Mirrors the Hermes always-on pattern (works from Lagos, a plane, a clinic).
- **Self-healing:** failed jobs retry with backoff; persistent failures escalate to Telegram. If stuck >3 attempts, `/investigate` pattern: stop, report, don't loop.

---

## 8. Claude command / tool integration (as the founder required)

The build and operation lean on the installed skill packs:

| Command/tool | Use in this project |
|---|---|
| `/goal` | Set and track the north-star objective for each build sprint and for channel KPIs (subs, watch-time, approval-queue throughput). |
| `/skills` | Discover/compose the gstack + CE skills used per phase (e.g. `/qa`, `/review`, `/ce:compound`). |
| `/loop` | Drive recurring autonomous ops: Topic Scout refresh, analytics pull, queue-health checks, "keep the review queue ≥ N stocked." |
| **Dynamic workflow** (`Workflow` tool) | Fan-out the per-video pipeline across agents: parallel asset generation, adversarial fact-check panel, multi-variant thumbnail generation + judge. Opt-in / "ultracode" for big batch generation runs. |
| `/office-hours` | Naming pass; challenge each new content pillar before we invest render budget. |
| `/ce:plan` → `/ce:work` → `/ce:review` → `/ce:compound` | The build loop. Every non-trivial fix compounds to `docs/solutions/`. |
| `/review`, `/qa` | Gate every PR; QA the Vercel dashboard in a real browser before it's "done." |
| `/ship`, `/land-and-deploy` | PR → CI → Railway/Vercel deploy. Never push to main directly. |
| **Hermes** (always-on) | Post-launch: watch the publish pipeline + channel health; DM if error rate or render failures spike. |

---

## 9. Build roadmap (phased)

> **Note on timelines:** the software spine is weeks; the **asset library (§5.3) is the long pole** — a parallel medical-illustration workstream that paces launch breadth, not the code. The wedge (the **PK/PD primitive set** — ADME path + target-interaction archetypes) is chosen so a *small* starter library unblocks broad drug coverage. **Start the illustrator search/commission in parallel with Phase 0** — onboarding + style-iteration has real lead time; don't wait until week 2.

**Phase 0 — Foundations (week 1)** *(greenlit, reversible)*
- `git init`, scaffold monorepo (worker + dashboard + remotion), push to `MannyAmah/YouTube-Video-Automation`.
- Supabase project: schema + RLS + Storage buckets.
- Secrets via env/Secrets Manager (Iron Law #4 — nothing hardcoded).
- YouTube Data API OAuth + channel created.
- *(Parallel, off-laptop):* begin medical-illustrator search/commission — it's lead-time-bound (§5.3).

**Phase 1 — Script→render spine + library kickoff (weeks 2–4, parallel tracks)**
- *Software:* Topic Scout (v1, scoped to **drugs the primitive set covers**, §5.3), Script Writer → beats + SSML, **Fact-Check layer + claim ledger** (early — it's core), Storyboard → `motion_spec`, `docs/STYLE.md`.
- *Software — parametrization framework (named deliverable):* build the **`motion_spec` schema → Remotion parametric-module framework** — the engine that turns an illustrator's vector art into a parameter-driven animated module (ligand docking, CYP450 metabolism, renal clearance) from `motion_spec`. A module = **art (illustrator) + engineering (this framework + per-module wiring)**; §5.3/§10.3 book the art role, this names the engineering role. The first PK/PD primitives are its proof.
  - **DoD (framework):** `motion_spec` params are validated against the registered module's schema **at storyboard-emit time**, not only at render — a bad spec fails before it's queued, so the failure surfaces early, not a stage late.
- *DoD — first `supabase db push`:* the migration is not "done" until an **anon read/write-denied behavior test** passes against the live DB (attempt an anonymous read and write; confirm both are denied) **before any real data flows**. Source-level RLS ≠ verified RLS.
- *Library (parallel, the long pole):* commissioned illustrator delivers base primitives + vector art for the **universal PK/PD primitive set** (§5.3: ADME path — absorption, CYP450 first-pass, distribution, renal clearance — + the 4 target-interaction archetypes); Emmanuel validates each asset; engineer wires them into the framework above.
- Exit: one end-to-end render of a drug's story from real primitives through the parametric framework.

**Phase 2 — Assets→assembled video + capture loop (weeks 4–6)**
- Real founder narration (soft-launch voices) → forced-alignment captions; **voice-memo commentary capture** (§2.3) wired through Telegram → transcript → claim ledger.
- Remotion render on Railway → MP4; metadata + thumbnail; ad-suitability gate.
- Library reaches **starter primitive-set coverage** (ADME path + target archetypes).

**Phase 3 — Human gate + soft launch (weeks 6–8)**
- Vercel review dashboard + Telegram approval bot; YouTube publish + disclaimer.
- **Dashboard auth — RLS row-scoping:** the Phase-1 read policy is `authenticated → all rows` (fine for a single operator). When the dashboard gets real/multiple users, **revisit RLS to scope rows per user/role** (esp. the claims ledger) before granting broader access.
- **Soft launch:** 5–10 *real-narration* videos on **drugs chosen to span the primitives** (varied ADME paths + target archetypes, §5.3), ~2/week, founder authors+reviews every one. Record clone training audio. Tune quality + style.

**Phase 4 — Autonomy, clone, scale (week 8+)**
- Verify synthetic-media disclosure policy → switch to cloned voice. Crons, analytics feedback, queue auto-stocking. Shorts repurposing. Hermes monitoring handoff.
- **Library expansion** gates drug coverage: add new mechanisms/organ-system primitives as new drug stories need them — each added before its drugs go live.

**Phase 5 — Social expansion (future, §11).**

---

## 10. Cost model (premium tier) — revised with per-video unit cost

v1 was ~1.5–2× light (per Checker): too few frames for "cinematic" pieces, Opus fact-check underestimated, and a single Railway worker *serializes* multi-minute renders. Rebuilt bottom-up.

### 10.1 Per-video unit cost (one 6–10 min long-form) — the number to defend against the Hermes hard-ceiling rule

| Component | Estimate | Notes |
|---|---|---|
| Claude — script + **fact-check** (atomic extraction + adversarial refute + revise loops, Opus-heavy) | $3–7 | The fact-check, not the script, dominates. Scales with claim count. |
| ElevenLabs (founder-cloned VO, ~1,200–1,800 words) | $1–3 | Cheaper after the library of common segments is cached. |
| Visuals (per-video API) | $0.50–2 | Library assets are **~$0 marginal once built** — but building them is a real workstream, costed separately in §10.4, not hidden here. Per-video API cost is occasional Flux/Ideogram *backgrounds* only. |
| Remotion render (multi-minute output = minutes of CPU/output-minute) | $1.50–4 | On **Remotion Lambda** at cadence; cheaper but slower on the Railway worker. |
| Optional Runway/Kling B-roll (selective) | $0–4 | Most videos: $0. |
| **Per long-form total** | **~$7–20** | Shorts ~$1.50–4 each (shorter VO/render, reuse assets). |

### 10.2 Monthly API/infra (Phase-2 honest cadence: ~14 long-form + ~30 Shorts)
Cadence reflects RN-authoring throughput (§2.3), not the v1 daily-long-form fantasy.
- Long-form: 14 × ~$13 avg ≈ **$180**
- Shorts: 30 × ~$2.75 avg ≈ **$85**
- Railway worker + **Remotion Lambda** render fleet: **$120–300**
- Supabase + Vercel + embeddings: **$40–90**
- **API/infra subtotal: ~$425–650/mo** at steady cadence.

### 10.3 Library production — the real long-pole cost (NOT amortized to ~$0)
The deterministic-accuracy moat (§5) is a labor cost the v1/v2 model hid — and it's **two roles**, not one:
- **Illustrator/motion designer** (contract or PT) — produces vector art for primitives + mechanism modules: **~$2k–6k front-loaded** over Phases 1–3 for the starter (wedge) library; then **~$500–1,500/mo** as coverage expands, tapering as primitives compound.
- **Engineer** — builds the `motion_spec`→Remotion parametrization framework + wires each module (§9 Phase 1). Largely covered by the existing software track (one-time framework build, then thin per-module wiring), but call it out so the "module" isn't mistaken for art-only.
- **Emmanuel's validation time:** minutes per asset, but real (same throughput constraint as §2.3).
- This is **capex that gates launch breadth**, not per-video opex. Budget it explicitly before Phase 1 — it's the single biggest non-API line.

### 10.4 All-in & control
- **All-in early (Phases 1–3):** API/infra ~$450 + library build ~$2k–6k one-time + ~$500–1,500/mo expansion ≈ **founder should plan ~$1.5–3k/mo blended during build**, settling toward **~$1–2k/mo** once the wedge library matures and expansion slows.
- **Remotion Lambda** is the render scale path; a single Railway worker serializes renders. Worker stays as orchestrator + dev renders.
- **Hard spend ceilings** on every provider (global CLAUDE.md Hermes rule) keyed to §10.1 unit cost × planned volume; a runaway loop trips the cap, not the card. The library labor line gets a separate, explicit budget — it doesn't hide inside API caps.

---

## 11. Future: autonomous social ad expansion (Facebook / Instagram / TikTok)

The same pipeline generates **vertical Shorts** natively. Phase 5 adds:
- Auto-repurpose long-form beats → 9:16 cuts with hook-first captions.
- Multi-platform publish APIs (TikTok, Meta Graph, IG Reels).
- A creative-testing loop: generate N ad variants → publish → read performance → `Workflow` judge picks winners → scale spend. (Mirrors Alpha Sentinel's agent-judge pattern.)
- **Compliance escalates here:** paid health ads have stricter platform rules — the fact-check + disclaimer layer becomes mandatory, not just good practice.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Medical misinformation → strikes/**removal** | Fact-check layer + claim ledger + RN human gate + disclaimers. The whole §6. |
| **Monetization eligibility / "inauthentic content" flag** (2025 rule — the existential one) | Clinician-authored at scale (§0.5): founder-cloned voice, per-video original RN commentary, proprietary parametric asset library (not generic templates), permanent human authorship. "100% automated" framing removed everywhere. |
| **Ad-suitability of clinical visuals** (injections/surgery/graphic imagery = ad-restricted) | Pre-publish ad-suitability gate (§0.5): stylized line-art abstraction instead of photoreal clinical footage; hedged framing on high-claim segments; flag-and-reframe before render. |
| FTC health-claim exposure (esp. Phase 5 ads) | No efficacy/benefit claim ships without substantiation in the claim ledger; educational-not-advice framing; escalated review for paid ads (§11). |
| RN professional-scope / licensing-board risk | Educational only, never individualized advice; consistent disclaimers; founder reviews scope-sensitive content (§1). |
| YouTube medical-misinfo policy | Automated policy conformance check; avoid cure/dosing-advice framing; cite sources. |
| Render cost/time blowups | Job queue + concurrency cap + **Remotion Lambda** parallel render + per-video unit-cost budget (§10); monitor via Hermes. |
| Visual inconsistency (AI drift) | Locked style guide + automated style-QA before render. |
| Voice/brand monotony | Single locked voice but varied pacing/music; periodic A/B on intros. |
| API rate limits (TTS/image) | Per-stage retry/backoff; queue smooths bursts; multi-provider fallbacks. |
| Single point of failure (worker) | Idempotent jobs + Supabase state = safe restart; Hermes alerts. |
| Burning API credits on a runaway loop | Hard spend caps on every provider (per global CLAUDE.md Hermes rule). |

---

## 13. Open questions for the founder

1. **Channel name** — run the `/office-hours` naming pass, or do you already have one?
2. **Voice clone** — ready to record the ElevenLabs Professional Voice Clone sample of *your* voice (§0.5/§2.1)? (~30 min of clean audio.) Or hold and ship with a stock voice for the soft launch?
3. **YouTube channel** — does one exist, or do we create fresh? (Need Google account + branding.)
4. **Review ramp** — confirmed: full human review is **permanent** for medical content (not "graduate to sampling"). What scales with channel standing + monetization health is *volume*. OK to lock that?
5. **Repo state** — `MannyAmah/YouTube-Video-Automation` is currently empty? Confirm we scaffold into it.

---

## 14. Definition of done (per global CLAUDE.md)

A video ships only when: script + storyboard generated → **fact-check passed, claims cited** → **original RN-perspective commentary present** (§0.5) → assets + render produced → metadata + disclaimer + ad-suitability check passed → **founder reviews and authors/approves** → published via API → analytics tracked → at least one lesson compounded to `docs/solutions/` for the build itself.

The *system* is "done" when it runs the full pipeline on a schedule and the founder's role is **active clinical authorship + review** on every video — not a rubber stamp. That permanent human authorship is the product, the compliance shield, and the monetization-eligibility signal, all at once (§0.5).
