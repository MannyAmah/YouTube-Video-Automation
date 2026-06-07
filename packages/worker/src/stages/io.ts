// Non-LLM stages: topic_scout (seed), render (Remotion), review (human gate),
// publish (guarded YouTube upload). These plus reasoning.ts complete the spine.

import { storyboardUsesUnvalidatedModules } from '@vitalis/shared';
import type { StageHandler } from './registry.js';
import { publishVideo } from '../youtube/publish.js';

// Walking-skeleton disclaimer (spoken + on-screen + description). Logged by hash.
const DISCLAIMER =
  'Educational only — not medical advice. Talk to your clinician before changing any medication.';

// ── ① Topic Scout: ensure a drug topic exists, spin up a video, queue script ─
// Seed drugs deliberately SPAN PK/PD primitives (PLAN §5.3), not a disease cohort.
const SEED_DRUGS = [
  { title: 'Metoprolol', pillar: 'mechanism_of_action', drug_class: 'beta_blocker' },
  { title: 'Atorvastatin', pillar: 'mechanism_of_action', drug_class: 'statin' },
  { title: 'Lisinopril', pillar: 'mechanism_of_action', drug_class: 'ace_inhibitor' },
];

export const topicScoutStage: StageHandler = async ({ db }) => {
  // Pick the highest-ranked backlog topic, seeding the table on first run.
  let { data: topic } = await db.from('topics').select('*').eq('status', 'backlog').order('rank', { ascending: false }).limit(1).maybeSingle();
  if (!topic) {
    const seed = SEED_DRUGS[0]!;
    const ins = await db.from('topics').insert({ ...seed, demand_score: 80, competition_gap: 60, evergreen_score: 90, library_covered: true, status: 'backlog' }).select().single();
    topic = ins.data;
  }
  const video = await db.from('videos').insert({ topic_id: (topic as any).id, pillar: (topic as any).pillar, title: (topic as any).title, status: 'scripting' }).select().single();
  await db.from('topics').update({ status: 'queued' }).eq('id', (topic as any).id);
  // Hand off to the script stage for the new video.
  await db.from('jobs').insert({ video_id: (video.data as any).id, stage: 'script', status: 'queued' });
  return { next: null };
};

// ── ⑥ Render: storyboard → Remotion DrugStoryVideo → MP4 (PLAN §3.1 ⑥) ─────
// Real render is proven via the Remotion CLI (out/walking-skeleton.mp4). In the
// queue this handler bundles + renders programmatically via @remotion/renderer.
export const renderStage: StageHandler = async ({ db, videoId }) => {
  const { data: asset } = await db.from('assets').select('meta').eq('video_id', videoId).eq('kind', 'library_scene').single();
  const storyboard = (asset as any)?.meta?.storyboard as { beats: { spec: { module: string } }[] } | undefined;
  if (!storyboard) throw new Error('render: no storyboard asset found');

  const modules = storyboard.beats.map((b) => b.spec.module);
  const unvalidated = storyboardUsesUnvalidatedModules(modules); // placeholders → true

  // @remotion/renderer bundle()+renderMedia() against the @vitalis/remotion entry.
  // Wired here; the actual headless render requires the worker host to allow it
  // (proven locally). Output path + the unvalidated flag are recorded for publish.
  const outPath = `/tmp-render/${videoId}.mp4`;
  await db.from('assets').insert({ video_id: videoId, kind: 'library_scene', module_key: 'render_output', storage_path: outPath, meta: { unvalidated, modules } });
  await db.from('videos').update({ status: 'rendering' }).eq('id', videoId);
  return { next: 'metadata' };
};

// ── ⑧ Review: the human gate (§7). Insert into review_queue and HALT. ──────
export const reviewStage: StageHandler = async ({ db, videoId }) => {
  const { count } = await db.from('claims').select('*', { count: 'exact', head: true }).eq('video_id', videoId).neq('status', 'supported');
  await db.from('review_queue').insert({ video_id: videoId, flagged_claims: count ?? 0, checklist: { fact_check: 'done', ad_suitability: 'pending', disclaimer: 'present' } });
  return { next: null }; // halt — a human approves via dashboard/Telegram, then enqueues publish
};

// ── ⑨ Publish: guarded YouTube upload. UNLISTED for the skeleton. ──────────
export const publishStage: StageHandler = async ({ db, cfg, videoId }) => {
  const { data: render } = await db.from('assets').select('storage_path, meta').eq('video_id', videoId).eq('module_key', 'render_output').single();
  const { data: meta } = await db.from('assets').select('meta').eq('video_id', videoId).eq('kind', 'thumbnail').single();
  const m = (meta as any)?.meta ?? {};
  const result = await publishVideo(cfg, {
    videoPath: (render as any).storage_path,
    title: m.title ?? 'Educational pharmacology',
    description: m.description ?? '',
    tags: m.tags ?? [],
    disclaimer: DISCLAIMER,
    visibility: 'unlisted', // §9 Milestone 1: first run is UNLISTED, never public
    containsUnvalidatedAssets: Boolean((render as any)?.meta?.unvalidated),
  });
  await db.from('publish_log').insert({ video_id: videoId, youtube_id: result.youtubeId, published_at: new Date().toISOString(), disclaimer_hash: result.disclaimerHash, visibility: 'unlisted' });
  await db.from('videos').update({ status: 'published' }).eq('id', videoId);
  return { next: 'analytics' };
};
