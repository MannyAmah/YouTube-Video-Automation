# PR #1 — Verification Evidence (for blind review)

The reviewer could not fetch PR #1 (private repo / fetch blocked). This doc
captures the actual repo state with command evidence so the blocking checks can
be verified without seeing the diff. **Result: all checks pass; no mismatch
between the prior report and the PR contents.**

Generated 2026-06-06 from branch `rebuild/v3-foundations` (PR #1 → `main`).

---

## PR #1 metadata (live, from `gh`)
```
PR#1 OPEN  rebuild/v3-foundations -> main  mergeable=MERGEABLE  +4121/-13474  files=63
```
The large deletion count (−13474) is the legacy reference tool being removed in
the greenfield replacement — preserved on `legacy/reference-tool` (see below).

---

## 1. BLOCKING — legacy branch is on ORIGIN, not local-only
```
$ gh api repos/MannyAmah/YouTube-Video-Automation/branches/legacy/reference-tool --jq ...
origin has: legacy/reference-tool @ 50d2cf8
```
✅ The reference tool is safe on the remote at commit `50d2cf8`. The greenfield
merge is reversible — overwriting `main` cannot lose the old tool.

---

## 2. RLS actually restricts (not permissive stubs); writes are service-role-only
```
tables with RLS enabled:                              9   (all tables)
SELECT-only policies (literal, applied via loop):     1   → covers all 9 tables
INSERT/UPDATE/DELETE policies for anon/authenticated: 0
```
The single read policy is created in a `do $$ … foreach … format() … $$` loop
over all 9 tables:
```sql
foreach t in array array[ 'topics','videos','scripts','claims','assets',
                          'jobs','review_queue','publish_log','metrics' ] loop
  execute format(
    'create policy %I on %I for select to authenticated using (true);', …);
```
✅ Every table: RLS **enabled**, **authenticated read-only**, **no anon access**,
**zero write policies**. The worker writes via the **service-role key** (bypasses
RLS by design; service-role key is worker-only per `.env.example`, never shipped
to the browser). Fail-safe posture: a missing policy denies, it doesn't allow.

---

## 3. `.env` protection — gitignored, and never committed in branch history
```
.gitignore:17  .env
.gitignore:18  .env.*
.gitignore:19  !.env.example

any .env ever ADDED across full branch history:   (none)
tracked files matching env:                        .env.example   (only)
```
✅ No real `.env` is tracked or was ever added in any commit on the branch.
Only the keys-blank `.env.example` template is committed (Iron Law #4).

---

## 4. YouTube publish is FAIL-CLOSED on the disclaimer (cannot publish without one)
`packages/worker/src/youtube/publish.ts` — the guard runs **before** any API call
or client construction:
```ts
if (!input.disclaimer.trim()) {
  throw new Error('refusing to publish: empty disclaimer (PLAN §6 requires one).');
}
const disclaimerHash = createHash('sha256').update(input.disclaimer).digest('hex');
```
✅ Empty/whitespace disclaimer → throws, nothing publishes. The disclaimer is
appended to the description and its SHA-256 is returned for the `publish_log`
audit (§3.3). Fail-closed, not fail-open.

---

## 5. `motion_spec` contract is extensible per-module (not hardcoded to one shape)
`packages/shared/src/motion-spec.ts`:
```ts
module: z.string(),                      // any registered mechanism module
params: z.record(z.unknown()).default({}) // module-specific, open-ended
```
`packages/remotion/src/modules/registry.ts`:
```ts
paramsSchema: z.ZodTypeAny;              // each module declares its OWN param schema
export function registerModule(m: MechanismModule): void { … }
```
✅ The contract is open at the `shared` layer (`module` + free-form `params`),
and each mechanism module validates its own params via its `paramsSchema` at
render time (`MechanismScene` calls `mod.paramsSchema.parse(params)`). New drug
classes register new modules without touching the shared contract or
`MechanismScene` — exactly the extensibility the §5 parametric system needs.

---

## 6. Workspace typechecks clean (re-run for this doc)
```
packages/shared   typecheck: Done
packages/remotion typecheck: Done
packages/worker   typecheck: Done
```
✅ `corepack pnpm -r typecheck` passes on all three code packages.

---

## What is NOT verified / NOT done (honest gaps)
- **No live Supabase project** — the migration is committed but **not applied** to
  any database (needs auth + cost confirm). SQL not executed against Postgres.
- **YouTube OAuth not wired** — `publish.ts` ports the flow but no refresh token
  exists yet (needs Google creds).
- **Stage handlers are stubs** — Phase 1 fills them (fact-check first).
- **`apps/dashboard`** is a Phase-3 placeholder (README only).

---

## Verdict
All five blocking/merge checks the reviewer named are confirmed against the actual
repo. Merge remains Emmanuel's action.
