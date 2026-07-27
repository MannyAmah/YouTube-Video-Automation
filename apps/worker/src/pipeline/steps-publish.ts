import { readFile } from 'fs/promises';
import { getRunChecked, runStateTransition } from '@yva/db';
import { QcReportSchema, reviewQc } from '@yva/shared';
import { getYouTubeClient } from '@yva/providers';
import type { StepContext } from './context';
import { isSystemPaused } from './context';
import { loadEvidence, loadLatestScript } from './steps-content';
import { buildVideoDescription } from './prompts';
import { enqueueStep } from '../queues';
import { oauthClientForChannel } from '../oauth-tokens';

/* ------------------------------------------------------------------------- */
/* approval — the gate before any upload                                     */
/* ------------------------------------------------------------------------- */

export async function stepApproval(ctx: StepContext, runId: string, epoch: number): Promise<void> {
  const run = await getRunChecked(ctx.prisma, runId);

  const paused = await isSystemPaused(ctx);
  if (paused || run.channel.paused) {
    ctx.log.warn({ runId, paused }, 'approval deferred: system or channel paused');
    return; // The resume scheduler re-enqueues when unpaused.
  }

  if (run.channel.publishMode === 'supervised') {
    ctx.log.info({ runId }, 'awaiting human approval (supervised mode)');
    return; // Human approves via the API, which advances the run.
  }

  // Autonomous mode: the QC policy is the approver.
  const qcPath = await ctx.store.requireArtifactPath(runId, 'qc_report');
  const qc = QcReportSchema.parse(JSON.parse(await readFile(qcPath, 'utf8')));
  const verdict = reviewQc(qc, run.brief.targetDurationSec);
  if (!verdict.ok) {
    await runStateTransition(ctx.prisma, runId, 'AWAITING_APPROVAL', 'FAILED', {
      failureReason: `Autonomous approval rejected:\n${verdict.failures.join('\n')}`,
      retryTargetState: 'RENDERING',
    });
    return;
  }

  await ctx.prisma.approval.create({
    data: {
      runId,
      stage: 'upload',
      decision: 'approved',
      actorType: 'policy',
      notes: `Autonomous QC approval. Duration ${Math.round(qc.videoDurationSec)}s, ${qc.checks.length} checks passed.`,
    },
  });
  await runStateTransition(ctx.prisma, runId, 'AWAITING_APPROVAL', 'APPROVED');
  await enqueueStep(ctx.queue, runId, 'upload', epoch);
}

/* ------------------------------------------------------------------------- */
/* upload — private upload with idempotency + reconciliation                 */
/* ------------------------------------------------------------------------- */

export async function stepUpload(ctx: StepContext, runId: string, epoch: number): Promise<void> {
  const run = await getRunChecked(ctx.prisma, runId);
  await runStateTransition(ctx.prisma, runId, 'APPROVED', 'UPLOADING_PRIVATE');

  try {
    const existing = await ctx.prisma.publication.findUnique({ where: { runId } });
    if (existing?.youtubeVideoId) {
      // Idempotency: a previous attempt already uploaded.
      ctx.log.info({ runId, videoId: existing.youtubeVideoId }, 'upload already complete');
      await runStateTransition(ctx.prisma, runId, 'UPLOADING_PRIVATE', 'UPLOADED_PRIVATE');
      await decidePublish(ctx, runId, epoch);
      return;
    }

    const [script, evidence] = [await loadLatestScript(ctx, runId), await loadEvidence(ctx, runId)];
    const videoPath = await ctx.store.requireArtifactPath(runId, 'video_mp4');
    const thumbnailPath = await ctx.store.requireArtifactPath(runId, 'thumbnail');
    const auth = await oauthClientForChannel(ctx.prisma, ctx.env, run.channelId);
    const youtube = getYouTubeClient(ctx.env, auth);

    const publication = await ctx.prisma.publication.upsert({
      where: { runId },
      create: { runId, privacyStatus: 'private', uploadStartedAt: new Date() },
      update: { uploadStartedAt: new Date(), lastError: null },
    });

    // Reconcile a crashed prior attempt: if an upload started but we never
    // recorded a video id, look for a video with this exact title before
    // uploading again (prevents duplicates on ambiguous failures).
    if (existing?.uploadStartedAt && youtube.searchVideos) {
      const candidates = await youtube
        .searchVideos(script.script.title, 5)
        .catch(() => [] as { title: string; videoId: string }[]);
      const match = candidates.find((c) => c.title === script.script.title);
      if (match) {
        ctx.log.warn({ runId, videoId: match.videoId }, 'reconciled orphaned upload');
        await ctx.prisma.publication.update({
          where: { id: publication.id },
          data: { youtubeVideoId: match.videoId, uploadedAt: new Date() },
        });
        await runStateTransition(ctx.prisma, runId, 'UPLOADING_PRIVATE', 'UPLOADED_PRIVATE');
        await decidePublish(ctx, runId, epoch);
        return;
      }
    }

    const description = buildVideoDescription(script.script, evidence);
    const { videoId } = await youtube.uploadPrivate({
      filePath: videoPath,
      title: script.script.title,
      description,
      tags: script.script.tags,
      categoryId: run.channel.youtubeCategoryId,
      privacyStatus: 'private',
      runId,
    });
    await ctx.prisma.publication.update({
      where: { id: publication.id },
      data: { youtubeVideoId: videoId, uploadedAt: new Date(), privacyStatus: 'private' },
    });
    await youtube.setThumbnail(videoId, thumbnailPath);
    ctx.log.info({ runId, videoId }, 'uploaded private video');

    await runStateTransition(ctx.prisma, runId, 'UPLOADING_PRIVATE', 'UPLOADED_PRIVATE');
    await decidePublish(ctx, runId, epoch);
  } catch (err) {
    await ctx.prisma.publication
      .updateMany({ where: { runId }, data: { lastError: (err as Error).message.slice(0, 2000) } })
      .catch(() => undefined);
    throw err;
  }
}

/* ------------------------------------------------------------------------- */
/* publish decision + publish                                                */
/* ------------------------------------------------------------------------- */

/** How many videos this channel published in the current UTC day. */
async function publishedToday(ctx: StepContext, channelId: string): Promise<number> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  return ctx.prisma.publication.count({
    where: { publishedAt: { gte: dayStart }, run: { channelId } },
  });
}

async function decidePublish(ctx: StepContext, runId: string, epoch: number): Promise<void> {
  const run = await getRunChecked(ctx.prisma, runId);
  if (run.channel.publishMode === 'supervised') {
    ctx.log.info({ runId }, 'uploaded private; awaiting human publish action (supervised mode)');
    return;
  }
  const paused = await isSystemPaused(ctx);
  if (paused || run.channel.paused) {
    ctx.log.warn({ runId }, 'publish deferred: paused');
    return;
  }

  const count = await publishedToday(ctx, run.channelId);
  let scheduledFor = new Date();
  let delayMs = 0;
  if (count >= run.channel.maxPublishesPerDay) {
    // Quota reached — schedule for the start of the next UTC day + 15:00 UTC
    // (a reasonable default publish hour), enforced again at publish time.
    scheduledFor = new Date();
    scheduledFor.setUTCDate(scheduledFor.getUTCDate() + 1);
    scheduledFor.setUTCHours(15, 0, 0, 0);
    delayMs = Math.max(0, scheduledFor.getTime() - Date.now());
  }

  await ctx.prisma.publication.update({ where: { runId }, data: { scheduledFor } });
  await runStateTransition(ctx.prisma, runId, 'UPLOADED_PRIVATE', 'SCHEDULED');
  await enqueueStep(ctx.queue, runId, 'publish', epoch, delayMs > 0 ? { delay: delayMs } : {});
  ctx.log.info({ runId, scheduledFor }, 'publish scheduled');
}

export async function stepPublish(ctx: StepContext, runId: string, epoch: number): Promise<void> {
  const run = await getRunChecked(ctx.prisma, runId);

  const paused = await isSystemPaused(ctx);
  if (paused || run.channel.paused) {
    ctx.log.warn({ runId }, 'publish skipped: paused (resume scheduler will retry)');
    return;
  }

  // Re-check quota at publish time.
  const count = await publishedToday(ctx, run.channelId);
  if (count >= run.channel.maxPublishesPerDay) {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(15, 0, 0, 0);
    await ctx.prisma.publication.update({ where: { runId }, data: { scheduledFor: tomorrow } });
    await enqueueStep(ctx.queue, runId, 'publish', epoch + 1, {
      delay: tomorrow.getTime() - Date.now(),
    });
    ctx.log.info({ runId, tomorrow }, 'daily publish quota reached; rescheduled');
    return;
  }

  const publication = await ctx.prisma.publication.findUnique({ where: { runId } });
  if (!publication?.youtubeVideoId) {
    throw new Error(`Run ${runId} is SCHEDULED but has no uploaded video id`);
  }

  const auth = await oauthClientForChannel(ctx.prisma, ctx.env, run.channelId);
  const youtube = getYouTubeClient(ctx.env, auth);
  await youtube.setPrivacy(publication.youtubeVideoId, 'public');

  // Confirm with the API before recording PUBLISHED.
  const status = await youtube.getVideoStatus(publication.youtubeVideoId);
  if (status.privacyStatus !== 'public') {
    throw new Error(
      `YouTube reports privacy "${status.privacyStatus}" after publish request for ${publication.youtubeVideoId}`,
    );
  }

  await ctx.prisma.publication.update({
    where: { runId },
    data: { privacyStatus: 'public', publishedAt: new Date() },
  });
  await ctx.prisma.approval.create({
    data: {
      runId,
      stage: 'publish',
      decision: 'approved',
      actorType: 'policy',
      notes: 'Autonomous publish (quota + pause checks passed).',
    },
  });
  await runStateTransition(ctx.prisma, runId, 'SCHEDULED', 'PUBLISHED');
  await ctx.prisma.contentBrief.update({
    where: { id: run.briefId },
    data: { status: 'done' },
  });
  ctx.log.info({ runId, videoId: publication.youtubeVideoId }, 'published');
}
