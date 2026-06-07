// Pipeline domain types — mirror supabase/migrations/0001_init.sql (PLAN §3.3).
// Keep this file in sync with the schema; generated DB types can supersede it
// later via `supabase gen types typescript`.

export const PIPELINE_STAGES = [
  'topic_scout',
  'script',
  'fact_check',
  'storyboard',
  'asset_gen',
  'render',
  'metadata',
  'review',
  'publish',
  'analytics',
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'blocked';

export type VideoStatus =
  | 'idea' | 'scripting' | 'fact_check' | 'needs_revision' | 'storyboard'
  | 'asset_gen' | 'rendering' | 'pending_review' | 'approved' | 'rejected'
  | 'scheduled' | 'published' | 'failed';

// Drug/mechanism-axis pillars (PLAN §2.2); disease is context, not a pillar.
export type ContentPillar =
  | 'drug_journey'          // ADME/PK arc
  | 'how_its_made'          // drug-development lifecycle
  | 'mechanism_of_action'   // pharmacodynamics deep-dive
  | 'dose_modifiers'        // pharmacogenomics, interactions, organ function, age
  | 'indications_effects';  // on/off-label uses + adverse effects

export type ClaimRisk = 'general' | 'clinical' | 'high_risk';
export type ClaimStatus = 'unverified' | 'supported' | 'refuted' | 'needs_review';

/** A medical assertion in the compliance ledger (§6). */
export interface Claim {
  id: string;
  videoId: string;
  assertion: string;
  risk: ClaimRisk;
  status: ClaimStatus;
  citations: Citation[];
  refutation?: string;
  reviewedBy?: string;
}

/** Corpus must be license-clean (§6): public/gov + StatPearls (CC-BY). */
export interface Citation {
  source: string;
  title: string;
  url: string;
  license: 'public_domain' | 'gov' | 'cc_by' | 'abstract_only';
  quote?: string;
}

export interface Job {
  id: string;
  videoId: string | null;
  stage: PipelineStage;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  payload: Record<string, unknown>;
  error?: string;
  runAfter: string;
}
