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

const notImplemented =
  (stage: PipelineStage): StageHandler =>
  async () => {
    throw new Error(`stage '${stage}' not implemented yet (Phase 1+)`);
  };

// The canonical order. The review gate halts the chain until a human decides.
export const STAGE_HANDLERS: Record<PipelineStage, StageHandler> = {
  topic_scout: notImplemented('topic_scout'),
  script: notImplemented('script'),
  fact_check: notImplemented('fact_check'), // §6 — build first, it is core
  storyboard: notImplemented('storyboard'),
  asset_gen: notImplemented('asset_gen'),
  render: notImplemented('render'),
  metadata: notImplemented('metadata'),
  review: async () => ({ next: null }), // halt: the human gate (§7)
  publish: notImplemented('publish'),
  analytics: notImplemented('analytics'),
};
