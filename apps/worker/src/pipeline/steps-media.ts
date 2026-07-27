import { createHash } from 'crypto';
import { join } from 'path';
import { getRunChecked, runStateTransition } from '@yva/db';
import { getImageProvider, getTtsProvider } from '@yva/providers';
import {
  buildSrt,
  composeThumbnail,
  LONGFORM_EXPECTATIONS,
  renderLongform,
  validateAudio,
  validateImage,
  validateVideo,
} from '@yva/media';
import { writeFile, stat } from 'fs/promises';
import type { StepContext } from './context';
import { loadLatestScript, loadLatestStoryboard } from './steps-content';
import { enqueueStep } from '../queues';

/* ------------------------------------------------------------------------- */
/* assets — narration audio + scene illustrations + thumbnail base           */
/* ------------------------------------------------------------------------- */

export async function stepAssets(ctx: StepContext, runId: string, epoch: number): Promise<void> {
  await getRunChecked(ctx.prisma, runId);
  const storyboard = await loadLatestStoryboard(ctx, runId);
  const tts = getTtsProvider(ctx.env);
  const images = getImageProvider(ctx.env);

  await ctx.store.ensureRunDir(runId, 'audio');
  await ctx.store.ensureRunDir(runId, 'images');

  for (let i = 0; i < storyboard.scenes.length; i++) {
    const scene = storyboard.scenes[i]!;
    const n = String(i + 1).padStart(3, '0');

    // Narration — idempotent: skip only when a validated artifact exists AND
    // was generated from this exact narration text (script revisions
    // invalidate stale audio).
    const audioSha = contentSha(scene.narration);
    const audioRel = ctx.store.relativePath(runId, 'audio', `scene_${n}.mp3`);
    if (!(await artifactFileExists(ctx, runId, audioRel, audioSha))) {
      const audioAbs = ctx.store.absolutePath(audioRel);
      const result = await tts.synthesize(scene.narration, audioAbs);
      const audioMeta = await validateAudio(audioAbs, 0.8);
      await ctx.store.record(runId, 'narration_audio', audioRel, 'audio/mpeg', result.provider, {
        sceneId: scene.id,
        sceneIndex: i,
        durationSec: audioMeta.durationSec,
        voice: result.voice,
        contentSha: audioSha,
      });
    }

    // Illustration — same content-hash invalidation on the prompt.
    const imageSha = contentSha(scene.imagePrompt);
    const imageRel = ctx.store.relativePath(runId, 'images', `scene_${n}.png`);
    if (!(await artifactFileExists(ctx, runId, imageRel, imageSha))) {
      const imageAbs = ctx.store.absolutePath(imageRel);
      const result = await images.generate(scene.imagePrompt, imageAbs);
      const imageMeta = await validateImage(imageAbs, {
        minWidth: 1024,
        minHeight: 720,
        minBytes: 10_000,
      });
      await ctx.store.record(runId, 'scene_image', imageRel, result.mimeType, result.provider, {
        sceneId: scene.id,
        sceneIndex: i,
        width: imageMeta.width,
        height: imageMeta.height,
        contentSha: imageSha,
      });
    }
    ctx.log.info({ runId, scene: scene.id, index: i }, 'scene assets ready');
  }

  // Thumbnail: generated base art + composed title text at 1280x720.
  const thumbBaseRel = ctx.store.relativePath(runId, 'images', 'thumbnail_base.png');
  const thumbSha = contentSha(storyboard.thumbnailPrompt);
  if (!(await artifactFileExists(ctx, runId, thumbBaseRel, thumbSha))) {
    const baseAbs = ctx.store.absolutePath(thumbBaseRel);
    const result = await images.generate(storyboard.thumbnailPrompt, baseAbs);
    await validateImage(baseAbs, { minWidth: 1024, minHeight: 720, minBytes: 10_000 });
    await ctx.store.record(runId, 'scene_image', thumbBaseRel, result.mimeType, result.provider, {
      role: 'thumbnail_base',
      contentSha: thumbSha,
    });
  }
  const thumbRel = ctx.store.relativePath(runId, 'thumbnail.jpg');
  await composeThumbnail(
    ctx.store.absolutePath(thumbBaseRel),
    storyboard.thumbnailTitleText,
    ctx.store.absolutePath(thumbRel),
  );
  const thumbMeta = await validateImage(ctx.store.absolutePath(thumbRel), {
    minWidth: 1280,
    minHeight: 720,
    minBytes: 20_000,
    maxBytes: 2_000_000, // YouTube thumbnail limit
  });
  await ctx.store.record(runId, 'thumbnail', thumbRel, 'image/jpeg', 'ffmpeg-compose', {
    width: thumbMeta.width,
    height: thumbMeta.height,
  });

  await runStateTransition(ctx.prisma, runId, 'GENERATING_ASSETS', 'RENDERING');
  await enqueueStep(ctx.queue, runId, 'render', epoch);
}

/** Short content hash used to invalidate assets when a script revision
 * changes a scene's narration or image prompt. */
function contentSha(text: string): string {
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
    if (meta.contentSha !== expectedContentSha) return false; // stale — regenerate
  }
  const info = await stat(ctx.store.absolutePath(relativePath)).catch(() => null);
  return info !== null && info.size === record.bytes;
}

/* ------------------------------------------------------------------------- */
/* render — assemble the MP4 + SRT captions                                  */
/* ------------------------------------------------------------------------- */

export async function stepRender(ctx: StepContext, runId: string, epoch: number): Promise<void> {
  await getRunChecked(ctx.prisma, runId);
  const storyboard = await loadLatestStoryboard(ctx, runId);

  const scenes = [];
  for (let i = 0; i < storyboard.scenes.length; i++) {
    const scene = storyboard.scenes[i]!;
    const n = String(i + 1).padStart(3, '0');
    const imageRel = ctx.store.relativePath(runId, 'images', `scene_${n}.png`);
    const audioRel = ctx.store.relativePath(runId, 'audio', `scene_${n}.mp3`);
    // Hard requirement: every scene's assets must exist, match records, and
    // match the CURRENT storyboard content (no stale-revision assets).
    if (!(await artifactFileExists(ctx, runId, imageRel, contentSha(scene.imagePrompt)))) {
      throw new Error(`Scene ${scene.id}: image asset missing or stale (${imageRel})`);
    }
    if (!(await artifactFileExists(ctx, runId, audioRel, contentSha(scene.narration)))) {
      throw new Error(`Scene ${scene.id}: narration asset missing or stale (${audioRel})`);
    }
    scenes.push({
      imagePath: ctx.store.absolutePath(imageRel),
      audioPath: ctx.store.absolutePath(audioRel),
      caption: scene.caption,
      narration: scene.narration,
    });
  }

  const videoRel = ctx.store.relativePath(runId, 'video.mp4');
  const workDir = join(await ctx.store.ensureRunDir(runId), 'render-work');
  const result = await renderLongform({
    scenes,
    outPath: ctx.store.absolutePath(videoRel),
    workDir,
  });
  await ctx.store.record(runId, 'video_mp4', videoRel, 'video/mp4', 'ffmpeg', {
    durationSec: result.durationSec,
    sceneCount: scenes.length,
  });

  const srt = buildSrt(
    scenes.map((s, i) => ({ narration: s.narration, durationSec: result.sceneDurations[i]! })),
  );
  const srtRel = ctx.store.relativePath(runId, 'captions.srt');
  await writeFile(ctx.store.absolutePath(srtRel), srt, 'utf8');
  await ctx.store.record(runId, 'captions_srt', srtRel, 'application/x-subrip', 'captions', {
    entries: srt.split('\n\n').length,
  });

  await runStateTransition(ctx.prisma, runId, 'RENDERING', 'QUALITY_CHECK');
  await enqueueStep(ctx.queue, runId, 'quality_check', epoch);
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
