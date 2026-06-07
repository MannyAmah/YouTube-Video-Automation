// LLM reasoning stages: script → fact_check → storyboard → metadata.
// Real implementations; they RUN once ANTHROPIC_API_KEY is set. No PHI (§1).
// Fact-check is the moat (§6): it extracts atomic claims, verifies/refutes them,
// and populates the claims ledger BEFORE anything renders or publishes.

import { z } from 'zod';
import { validateMotionSpecAtEmit } from '@vitalis/shared';
import type { StageHandler } from './registry.js';
import { askJson } from './anthropic.js';

// ── ② Script: drug topic → narrative beats + SSML ─────────────────────────
const ScriptOut = z.object({
  title: z.string(),
  beats: z.array(z.object({ vo_text: z.string(), ssml: z.string() })).min(3),
});

export const scriptStage: StageHandler = async ({ db, cfg, videoId }) => {
  const { data: video } = await db.from('videos').select('*, topics(*)').eq('id', videoId).single();
  const drug = (video as any)?.topics?.title ?? (video as any)?.title ?? 'the drug';
  const out = await askJson(cfg, {
    model: cfg.CLAUDE_MODEL_REASONING,
    system:
      'You are an RN-level medical educator. Write an accurate, engaging short script that follows a DRUG through the body: development/use → ADME (absorption, metabolism, distribution, clearance) → mechanism of action → key effects. Disease is context, not the topic. Every factual claim must be standard, citable pharmacology.',
    user: `Drug: ${drug}. Write 4–6 beats. Each beat: vo_text (1–2 sentences) and an SSML version.`,
    schema: ScriptOut,
  });
  await db.from('scripts').insert({ video_id: videoId, beats: out.beats, word_count: out.beats.reduce((n, b) => n + b.vo_text.split(/\s+/).length, 0) });
  await db.from('videos').update({ title: out.title, status: 'fact_check' }).eq('id', videoId);
  return { next: 'fact_check' };
};

// ── ③ Fact-check + claim ledger (§6) ──────────────────────────────────────
const Claims = z.object({
  claims: z.array(
    z.object({
      assertion: z.string(),
      risk: z.enum(['general', 'clinical', 'high_risk']),
      status: z.enum(['supported', 'refuted', 'needs_review']),
      citations: z.array(z.object({ source: z.string(), title: z.string(), url: z.string(), license: z.enum(['public_domain', 'gov', 'cc_by', 'abstract_only']) })),
      refutation: z.string().optional(),
    }),
  ),
});

export const factCheckStage: StageHandler = async ({ db, cfg, videoId }) => {
  const { data: script } = await db.from('scripts').select('beats').eq('video_id', videoId).single();
  const text = JSON.stringify((script as any)?.beats ?? []);
  const out = await askJson(cfg, {
    model: cfg.CLAUDE_MODEL_REASONING,
    maxTokens: 8192,
    system:
      'You are a pharmacology fact-checker. Extract every atomic medical claim. For each: assign risk (general/clinical/high_risk), verify against licensable sources ONLY (FDA/DailyMed, NIH/MedlinePlus, PubMed abstracts, StatPearls CC-BY), set status, and adversarially try to REFUTE it. Unsupported or high-risk-without-citation → needs_review.',
    user: `Script beats:\n${text}`,
    schema: Claims,
  });
  await db.from('claims').insert(out.claims.map((c) => ({ video_id: videoId, ...c })));
  // Gate: any refuted/needs_review high-risk claim blocks the pipeline for revision.
  const blocking = out.claims.filter((c) => c.status !== 'supported' && (c.risk === 'high_risk' || c.status === 'refuted'));
  if (blocking.length) {
    await db.from('videos').update({ status: 'needs_revision' }).eq('id', videoId);
    return { next: null }; // halt → revision (human or re-script loop)
  }
  await db.from('videos').update({ status: 'storyboard' }).eq('id', videoId);
  return { next: 'storyboard' };
};

// ── ④ Storyboard: beats → motion_spec[], validated AT EMIT (DoD B) ────────
const Storyboard = z.object({
  beats: z.array(
    z.object({
      caption: z.string(),
      spec: z.object({
        module: z.string(),
        params: z.record(z.unknown()).default({}),
        durationSec: z.number().positive(),
        keyframes: z.array(z.object({ t: z.number(), state: z.string(), easing: z.string().optional() })).min(1),
        beatIndex: z.number().int().nonnegative(),
      }),
    }),
  ).min(1),
});

export const storyboardStage: StageHandler = async ({ db, cfg, videoId }) => {
  const { data: script } = await db.from('scripts').select('beats').eq('video_id', videoId).single();
  const out = await askJson(cfg, {
    model: cfg.CLAUDE_MODEL_REASONING,
    system:
      'Map each script beat to a motion_spec using ONLY these mechanism modules: absorption, cyp450_metabolism, receptor_docking (params.mode: agonist|antagonist), renal_clearance. Emit {caption, spec{module,params,durationSec,keyframes,beatIndex}}.',
    user: `Beats:\n${JSON.stringify((script as any)?.beats ?? [])}`,
    schema: Storyboard,
  });
  // DoD B: validate every spec's module+params NOW, before queuing the render.
  for (const b of out.beats) validateMotionSpecAtEmit(b.spec);
  await db.from('assets').insert({ video_id: videoId, kind: 'library_scene', meta: { storyboard: out } });
  await db.from('videos').update({ status: 'rendering' }).eq('id', videoId);
  return { next: 'render' };
};

// ── ⑦ Metadata: title/description/tags + disclaimer ───────────────────────
const Meta = z.object({ title: z.string(), description: z.string(), tags: z.array(z.string()) });

export const metadataStage: StageHandler = async ({ db, cfg, videoId }) => {
  const { data: video } = await db.from('videos').select('title').eq('id', videoId).single();
  const out = await askJson(cfg, {
    model: cfg.CLAUDE_MODEL_FAST,
    system: 'Write SEO YouTube metadata for an educational pharmacology video. Accurate, non-clickbait, no medical-advice framing.',
    user: `Working title: ${(video as any)?.title}`,
    schema: Meta,
  });
  await db.from('assets').insert({ video_id: videoId, kind: 'thumbnail', meta: out });
  await db.from('videos').update({ status: 'pending_review' }).eq('id', videoId);
  return { next: 'review' };
};
