import { stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { getRunChecked, runStateTransition } from '@yva/db';
import { getImageProvider, getTtsProvider } from '@yva/providers';
import type { AnimationScene } from '@yva/shared';
import {
  buildSrt,
  composeThumbnail,
  LONGFORM_EXPECTATIONS,
  runFfmpeg,
  validateAudio,
  validateImage,
  validateVideo,
} from '@yva/media';
import type { StepContext } from './context';
import { loadAnimationPlan, loadLatestScript } from './steps-content';
import { renderAnimationScenes, AnimatorScene } from './animate';
import { enqueueStep } from '../queues';

/* ------------------------------------------------------------------------- */
/* assets — narration per scene + thumbnail                                  */
/* ------------------------------------------------------------------------- */

export async function stepAssets(ctx: StepContext, runId: string, epoch: number): Promise<void> {
  await getRunChecked(ctx.prisma, runId);
  const plan = await loadAnimationPlan(ctx, runId);
  const tts = getTtsProvider(ctx.env);
  const images = getImageProvider(ctx.env);

  await ctx.store.ensureRunDir(runId, 'audio');
  await ctx.store.ensureRunDir(runId, 'images');

  // Narration per scene — idempotent + content-hash invalidated.
  for (let i = 0; i < plan.scenes.length; i++) {
    const scene = plan.scenes[i]!;
    const n = String(i + 1).padStart(3, '0');
    const audioRel = ctx.store.relativePath(runId, 'audio', `scene_${n}.mp3`);
    const sha = contentSha(scene.narration);
    if (!(await artifactFileExists(ctx, runId, audioRel, sha))) {
      const audioAbs = ctx.store.absolutePath(audioRel);
      const result = await tts.synthesize(scene.narration, audioAbs);
      const meta = await validateAudio(audioAbs, 0.6);
      await ctx.store.record(runId, 'narration_audio', audioRel, 'audio/mpeg', result.provider, {
        sceneId: scene.id,
        sceneIndex: i,
        durationSec: meta.durationSec,
        voice: result.voice,
        contentSha: sha,
      });
    }
    ctx.log.info({ runId, scene: scene.id, index: i }, 'narration ready');
  }

  // Thumbnail: generated base art + composed title text.
  const thumbBaseRel = ctx.store.relativePath(runId, 'images', 'thumbnail_base.png');
  const thumbSha = contentSha(plan.thumbnailPrompt);
  if (!(await artifactFileExists(ctx, runId, thumbBaseRel, thumbSha))) {
    const baseAbs = ctx.store.absolutePath(thumbBaseRel);
    const result = await images.generate(plan.thumbnailPrompt, baseAbs);
    await validateImage(baseAbs, { minWidth: 1024, minHeight: 720, minBytes: 10_000 });
    await ctx.store.record(runId, 'scene_image', thumbBaseRel, result.mimeType, result.provider, {
      role: 'thumbnail_base',
      contentSha: thumbSha,
    });
  }
  const thumbRel = ctx.store.relativePath(runId, 'thumbnail.jpg');
  await composeThumbnail(
    ctx.store.absolutePath(thumbBaseRel),
    plan.thumbnailTitleText,
    ctx.store.absolutePath(thumbRel),
  );
  const thumbMeta = await validateImage(ctx.store.absolutePath(thumbRel), {
    minWidth: 1280,
    minHeight: 720,
    minBytes: 20_000,
    maxBytes: 2_000_000,
  });
  await ctx.store.record(runId, 'thumbnail', thumbRel, 'image/jpeg', 'ffmpeg-compose', {
    width: thumbMeta.width,
    height: thumbMeta.height,
  });

  await runStateTransition(ctx.prisma, runId, 'GENERATING_ASSETS', 'RENDERING');
  await enqueueStep(ctx.queue, runId, 'render', epoch);
}

function contentSha(text: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

async function artifactFileExists(
  ctx: StepContext,
  runId: string,
  relativePath: string,
  expectedContentSha?: string,
): Promise<boolean> {
  const record = await ctx.prisma.artifact.findFirst({ where: { runId, relativePath } });
  if (!record) return false;
  if (expectedContentSha) {
    const meta = (record.meta ?? {}) as { contentSha?: string };
    if (meta.contentSha !== expectedContentSha) return false;
  }
  const info = await stat(ctx.store.absolutePath(relativePath)).catch(() => null);
  return info !== null && info.size === record.bytes;
}

async function narrationDuration(ctx: StepContext, runId: string, index: number): Promise<number> {
  const n = String(index + 1).padStart(3, '0');
  const rel = ctx.store.relativePath(runId, 'audio', `scene_${n}.mp3`);
  const record = await ctx.prisma.artifact.findFirst({ where: { runId, relativePath: rel } });
  const meta = (record?.meta ?? {}) as { durationSec?: number };
  return meta.durationSec ?? 0;
}

/* ------------------------------------------------------------------------- */
/* render — animate scenes, mux narration, concat, captions                  */
/* ------------------------------------------------------------------------- */

const TAIL_PAD = 0.6; // seconds of hold after narration in each scene

export async function stepRender(ctx: StepContext, runId: string, epoch: number): Promise<void> {
  await getRunChecked(ctx.prisma, runId);
  const plan = await loadAnimationPlan(ctx, runId);

  const runDir = await ctx.store.ensureRunDir(runId);
  const animDir = join(runDir, 'anim');
  const molDir = join(runDir, 'mols');

  // Build the animator plan: each scene's clip length = narration + tail pad.
  const animScenes: AnimatorScene[] = [];
  const narrationSecs: number[] = [];
  for (let i = 0; i < plan.scenes.length; i++) {
    const scene = plan.scenes[i]!;
    const narr = await narrationDuration(ctx, runId, i);
    narrationSecs.push(narr);
    animScenes.push({
      id: `scene_${String(i + 1).padStart(3, '0')}`,
      type: scene.primitive,
      params: withCaption(scene),
      target_seconds: Math.max(2.5, narr + TAIL_PAD),
    });
  }

  const manifest = await renderAnimationScenes(ctx.env, animScenes, animDir, molDir);
  if (!manifest.ok) {
    const failed = manifest.scenes.filter((s) => !s.ok).map((s) => s.id);
    // A scene may have rendered as a fallback card and still be ok; only a
    // truly missing clip is fatal.
    if (failed.length > 0) {
      throw new Error(`Animation render failed for scenes: ${failed.join(', ')}`);
    }
  }

  // Mux narration into each clip, padding audio/video to the same length.
  const withAudio: string[] = [];
  const clipDurations: number[] = [];
  for (let i = 0; i < plan.scenes.length; i++) {
    const sid = `scene_${String(i + 1).padStart(3, '0')}`;
    const clip = join(animDir, `${sid}.mp4`);
    const audioAbs = ctx.store.absolutePath(
      ctx.store.relativePath(runId, 'audio', `${sid}.mp3`),
    );
    const out = join(animDir, `${sid}_av.mp4`);
    await runFfmpeg([
      '-i', clip,
      '-i', audioAbs,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-ar', '44100',
      '-ac', '2',
      // Video clip is already narration+pad long; pad audio with silence to
      // match the video so nothing is cut, then stop at the video end.
      '-af', 'apad',
      '-shortest',
      out,
    ]);
    withAudio.push(out);
    const info = manifest.scenes.find((s) => s.id === sid);
    clipDurations.push(info?.duration ?? narrationSecs[i]! + TAIL_PAD);
  }

  // Captions from the scene narrations + clip durations — generated BEFORE
  // concat so we can burn them into the video (spoken words == on-screen
  // words == the visual, all in sync).
  const srt = buildSrt(
    plan.scenes.map((s, i) => ({ narration: s.narration, durationSec: clipDurations[i]! })),
  );
  const srtRel = ctx.store.relativePath(runId, 'captions.srt');
  const srtAbs = ctx.store.absolutePath(srtRel);
  await writeFile(srtAbs, srt, 'utf8');
  await ctx.store.record(runId, 'captions_srt', srtRel, 'application/x-subrip', 'captions', {
    entries: srt.split('\n\n').length,
  });

  // Concat with a uniform re-encode, burning the synchronized captions in a
  // legible boxed style along the bottom.
  const listPath = join(animDir, 'concat.txt');
  await writeFile(listPath, withAudio.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
  const videoRel = ctx.store.relativePath(runId, 'video.mp4');
  const subFilter =
    `subtitles=${ffescapeFilterPath(srtAbs)}:force_style='` +
    'FontName=DejaVu Sans,Fontsize=17,Bold=1,PrimaryColour=&H00FFFFFF&,' +
    "OutlineColour=&H00101726&,BorderStyle=3,Outline=2,Shadow=0,MarginV=40'";
  await runFfmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-vf', subFilter,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-movflags', '+faststart',
    ctx.store.absolutePath(videoRel),
  ]);
  await ctx.store.record(runId, 'video_mp4', videoRel, 'video/mp4', 'manim+ffmpeg', {
    sceneCount: plan.scenes.length,
    captionsBurned: true,
  });

  await runStateTransition(ctx.prisma, runId, 'RENDERING', 'QUALITY_CHECK');
  await enqueueStep(ctx.queue, runId, 'quality_check', epoch);
}

/** Escape a filesystem path for use inside an ffmpeg -vf filter argument. */
function ffescapeFilterPath(p: string): string {
  // ffmpeg filter parsing needs ':' and '\' escaped inside the option value.
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/** Merge the scene caption into params so on-screen text is available. */
function withCaption(scene: AnimationScene): Record<string, unknown> {
  const params = { ...(scene.params ?? {}) };
  if (scene.caption && !params.caption) params.caption = scene.caption;
  return params;
}

/* ------------------------------------------------------------------------- */
/* quality_check — ffprobe validation gate                                   */
/* ------------------------------------------------------------------------- */

export async function stepQualityCheck(
  ctx: StepContext,
  runId: string,
  epoch: number,
): Promise<void> {
  await getRunChecked(ctx.prisma, runId);
  const videoPath = await ctx.store.requireArtifactPath(runId, 'video_mp4');
  const { script } = await loadLatestScript(ctx, runId);

  const report = await validateVideo(videoPath, LONGFORM_EXPECTATIONS);
  await ctx.store.saveJson(runId, 'qc_report', 'qc_report.json', report, 'quality-check', {
    passed: report.passed,
    durationSec: report.videoDurationSec,
  });

  if (!report.passed) {
    const failed = report.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`);
    await runStateTransition(ctx.prisma, runId, 'QUALITY_CHECK', 'FAILED', {
      failureReason: `Quality check failed:\n${failed.join('\n')}`,
      retryTargetState: 'RENDERING',
    });
    return;
  }

  ctx.log.info(
    { runId, durationSec: report.videoDurationSec, title: script.title },
    'quality check passed',
  );
  await runStateTransition(ctx.prisma, runId, 'QUALITY_CHECK', 'AWAITING_APPROVAL');
  await enqueueStep(ctx.queue, runId, 'approval', epoch);
}
