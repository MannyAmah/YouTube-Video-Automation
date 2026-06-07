// Stage registry — one handler per pipeline stage (PLAN §3.1). Each handler is
// an idempotent job: it reads the video's current state, does its work, writes
// results, and returns the next stage to enqueue (or null to stop, e.g. the
// review gate waits for a human).
//
// Phase 0 ships the skeleton + contracts. Phase 1 fills the handlers
// (Script, Fact-Check + claim ledger, Storyboard) — fact-check first, it's core.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PipelineStage } from '@vitalis/shared';
import type { Config } from '../config.js';

export interface StageContext {
  db: SupabaseClient;
  cfg: Config;
  videoId: string;
  payload: Record<string, unknown>;
}

export interface StageResult {
  /** Stage to enqueue next, or null to halt (e.g. awaiting human review). */
  next: PipelineStage | null;
  patch?: Record<string, unknown>;
}

export type StageHandler = (ctx: StageContext) => Promise<StageResult>;

// The canonical order. The review gate halts the chain until a human decides.
// Handlers are imported lazily to avoid a cycle (handlers import this module).
export async function loadStageHandlers(): Promise<Record<PipelineStage, StageHandler>> {
  const r = await import('./reasoning.js');
  const io = await import('./io.js');
  return {
    topic_scout: io.topicScoutStage,
    script: r.scriptStage,
    fact_check: r.factCheckStage, // §6 — the moat, runs before render/publish
    storyboard: r.storyboardStage,
    asset_gen: async () => ({ next: 'render' }), // placeholder assets are programmatic (§9 M1); no-op stage
    render: io.renderStage,
    metadata: r.metadataStage,
    review: io.reviewStage, // halt: the human gate (§7)
    publish: io.publishStage,
    analytics: async () => ({ next: null }), // Phase 4
  };
}
