# @vitalis/dashboard

The human-approval review dashboard (PLAN §7). **Built in Phase 3** — placeholder for now.

Next.js 14 (App Router) + Tailwind + shadcn/ui on Vercel. Reads Supabase via the
anon/authed key (RLS read-only; the worker owns all writes). Surfaces the review
queue: script, storyboard, the flagged-claims report, the rendered draft, and the
ad-suitability checklist — with approve / request-revision / reject actions that
flip a video's state. Mirrors the Telegram approval gate for desk-based review.

Scaffolding intentionally deferred so Phase 0 stays a thin, reviewable foundation.
