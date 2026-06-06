# Vitalis

**Clinician-authored medical education video pipeline.** Automated production,
real RN authorship in every artifact. Teaches medications and diseases through
narrative stories + anatomically grounded **animated** illustration (Remotion
parametric library, not slideshow).

> Full design: [`docs/PLAN.md`](docs/PLAN.md) · Visual system: [`docs/STYLE.md`](docs/STYLE.md)
> Original brief: [`docs/BRIEF.md`](docs/BRIEF.md)

This greenfield rebuild replaces the earlier `youtube-automation-agent` reference
tool (the brief said to *improve on* it). That code is preserved on the
**`legacy/reference-tool`** branch; only its YouTube OAuth/publish flow was
salvaged (see `packages/worker/src/youtube/publish.ts`).

## Architecture (PLAN §3)

A resumable Supabase **job queue** drives a per-video pipeline:

```
topic_scout → script → fact_check → storyboard → asset_gen
            → render → metadata → [REVIEW: human gate] → publish → analytics
```

The **fact-check + claim ledger** (PLAN §6) runs before the human ever sees a
draft — the compliance backbone. Nothing publishes without a logged disclaimer
and the founder's approval. Cadence is gated by RN authoring throughput, not
compute (PLAN §2.3).

## Monorepo layout

| Path | What |
|---|---|
| `packages/shared` | Domain types + the `motion_spec` contract (§5) |
| `packages/worker` | Railway orchestrator: queue loop, stage handlers, YouTube publish |
| `packages/remotion` | Parametric mechanism-module library + render (§5.3) |
| `apps/dashboard` | Vercel review dashboard — human approval gate (Phase 3) |
| `supabase/migrations` | Schema + RLS (the claim ledger lives here) |
| `docs/` | PLAN, STYLE, BRIEF |

## Status

**Phase 0 — Foundations.** Monorepo scaffold, schema, worker/queue skeleton,
parametric-render contract, YouTube publish module. Stage handlers are stubs;
Phase 1 fills them (fact-check first). See PLAN §9 for the roadmap.

## Develop

```bash
pnpm install
cp .env.example .env        # fill in — never commit .env
pnpm typecheck
pnpm worker:dev             # runs the queue loop (needs Supabase + Anthropic keys)
pnpm remotion:studio        # opens the Remotion studio
```

Supabase: `supabase link` to the cloud project, then `pnpm db:push` to apply
`supabase/migrations/`.

## Guardrails

- **No secrets in code** — env vars / secrets manager only (`.env` is gitignored).
- **No PHI** — synthetic personas, public medical facts (PLAN §1; HIPAA is *not*
  the governing frame — FTC/YouTube-policy/RN-scope are).
- **Never push to `main` directly** — land via PR.
