// Vitalis worker — the orchestrator (PLAN §3.2, §7).
// A continuous queue loop: lease a queued job whose run_after has passed, run
// its stage handler, advance state, enqueue the next stage. Idempotent jobs +
// Supabase state = safe restart. Heavy renders run here (Lambda at scale, §10).
//
// Phase 0: the loop, leasing, retry/backoff, and graceful shutdown are real.
// The stage handlers are stubs (registry.ts) — Phase 1 fills them, fact-check first.

import { loadConfig } from './config.js';
import { makeDb } from './db.js';
import { loadStageHandlers } from './stages/registry.js';
import type { PipelineStage, Job } from '@vitalis/shared';
import type { StageHandler } from './stages/registry.js';

type Handlers = Record<PipelineStage, StageHandler>;

const POLL_MS = 3000;
let shuttingDown = false;

async function leaseJob(db: ReturnType<typeof makeDb>): Promise<Job | null> {
  // NOTE: a SKIP LOCKED RPC is the correct primitive for multi-worker safety;
  // this single-worker lease is the Phase 0 placeholder.
  const { data, error } = await db
    .from('jobs')
    .update({ status: 'running', locked_at: new Date().toISOString() })
    .eq('status', 'queued')
    .lte('run_after', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(1)
    .select()
    .maybeSingle();
  if (error) throw error;
  return (data as Job | null) ?? null;
}

async function runJob(db: ReturnType<typeof makeDb>, cfg: ReturnType<typeof loadConfig>, handlers: Handlers, job: Job) {
  const handler = handlers[job.stage];
  try {
    const result = await handler({ db, cfg, videoId: job.videoId ?? '', payload: job.payload });
    await db.from('jobs').update({ status: 'done' }).eq('id', job.id);
    if (result.next && job.videoId) {
      await db.from('jobs').insert({ video_id: job.videoId, stage: result.next, status: 'queued' });
    }
  } catch (err) {
    const attempts = job.attempts + 1;
    const failed = attempts >= job.maxAttempts;
    // Exponential backoff; escalate to a human past max attempts (PLAN §7).
    const backoffSec = Math.min(2 ** attempts * 30, 3600);
    await db
      .from('jobs')
      .update({
        status: failed ? 'failed' : 'queued',
        attempts,
        error: String(err instanceof Error ? err.message : err),
        run_after: new Date(Date.now() + backoffSec * 1000).toISOString(),
        locked_at: null,
      })
      .eq('id', job.id);
    console.error(`[job ${job.id}] stage=${job.stage} attempt=${attempts}${failed ? ' FAILED' : ''}:`, err);
  }
}

async function main() {
  const cfg = loadConfig();
  const db = makeDb(cfg);
  const handlers = await loadStageHandlers();
  console.log('Vitalis worker started. Polling the job queue…');

  process.on('SIGINT', () => { shuttingDown = true; });
  process.on('SIGTERM', () => { shuttingDown = true; });

  while (!shuttingDown) {
    try {
      const job = await leaseJob(db);
      if (job) {
        await runJob(db, cfg, handlers, job);
      } else {
        await sleep(POLL_MS);
      }
    } catch (err) {
      console.error('queue loop error:', err);
      await sleep(POLL_MS);
    }
  }
  console.log('Worker shut down cleanly.');
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
