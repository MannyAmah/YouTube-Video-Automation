import type { Job, Queue } from 'bullmq';
import { ACTIVE_STATES, PipelineStep, STEP_ENTRY_STATE } from '@yva/shared';
import { getYouTubeClient } from '@yva/providers';
import { MEDICATION_BACKLOG } from '@yva/research';
import type { StepContext } from './pipeline/context';
import { isSystemPaused } from './pipeline/context';
import { DEFAULT_JOB_OPTIONS, PipelineJobData, enqueueStep } from './queues';
import { oauthClientForChannel } from './oauth-tokens';

/**
 * Durable schedules (BullMQ repeatable jobs — they live in Redis, survive
 * deploys and restarts, and cannot double-fire across replicas):
 *
 *  daily_brief    — pick the next medication from the backlog, open a brief,
 *                   start a production run.
 *  analytics_sync — pull real stats for published videos.
 *  resume_runs    — crash/pause recovery: re-enqueue the current step for
 *                   runs whose queue job was lost, and runs parked by pause.
 */

export const SCHEDULES = [
  // Three briefs daily, each a few hours ahead of its publish slot
  // (slots: 13:00, 17:30, 22:00 UTC — morning/afternoon/evening US Eastern).
  { name: 'daily_brief', cron: '0 6,10,15 * * *' },
  { name: 'analytics_sync', cron: '0 */6 * * *' },
  { name: 'resume_runs', cron: '*/30 * * * *' },
] as const;

export async function registerSchedules(queue: Queue): Promise<void> {
  for (const schedule of SCHEDULES) {
    await queue.upsertJobScheduler(
      schedule.name,
      { pattern: schedule.cron },
      { name: schedule.name, data: {}, opts: { removeOnComplete: { count: 100 } } },
    );
  }
}

export async function processSchedulerJob(ctx: StepContext, job: Job): Promise<void> {
  switch (job.name) {
    case 'daily_brief':
      await runDailyBrief(ctx);
      return;
    case 'analytics_sync':
      return runAnalyticsSync(ctx);
    case 'resume_runs':
      return resumeRuns(ctx);
    default:
      ctx.log.warn({ name: job.name }, 'unknown scheduler job');
  }
}

/* ------------------------------------------------------------------------- */

export async function runDailyBrief(ctx: StepContext): Promise<string | null> {
  const paused = await isSystemPaused(ctx);
  if (paused) {
    ctx.log.warn({ paused }, 'daily brief skipped: paused');
    return null;
  }
  const channel = await ctx.prisma.channel.findFirst({ where: { paused: false } });
  if (!channel) {
    ctx.log.warn('daily brief skipped: no active channel');
    return null;
  }

  // Backstop: don't stack briefs if production is behind.
  const inFlight = await ctx.prisma.productionRun.count({
    where: { channelId: channel.id, state: { notIn: ['PUBLISHED', 'CANCELLED', 'FAILED'] } },
  });
  if (inFlight >= 4) {
    ctx.log.warn({ inFlight }, 'daily brief skipped: production backlog');
    return null;
  }

  const covered = await ctx.prisma.contentBrief.findMany({
    where: { channelId: channel.id, status: { not: 'abandoned' } },
    select: { medicationQuery: true },
  });
  const coveredSet = new Set(covered.map((b) => b.medicationQuery.toLowerCase()));
  const next = MEDICATION_BACKLOG.find((m) => !coveredSet.has(m.toLowerCase()));
  if (!next) {
    ctx.log.warn('medication backlog exhausted — add topics or new angles');
    return null;
  }

  const runId = await startRunForMedication(ctx, channel.id, next, 'scheduler');
  ctx.log.info({ medication: next, runId }, 'daily brief created');
  return runId;
}

/** Shared by the scheduler and the API's manual "generate now" action. */
export async function startRunForMedication(
  ctx: StepContext,
  channelId: string,
  medicationQuery: string,
  createdBy: 'scheduler' | 'admin',
): Promise<string> {
  const brief = await ctx.prisma.contentBrief.create({
    data: {
      channelId,
      medicationQuery,
      createdBy,
      status: 'in_production',
      audienceNote:
        'Patients and caregivers with no medical background. Explain like the viewer is five years old, using visual metaphors, without being condescending.',
    },
  });
  const run = await ctx.prisma.productionRun.create({
    data: { channelId, briefId: brief.id, state: 'RESEARCHING' },
  });
  await enqueueStep(ctx.queue, run.id, 'research', 0);
  return run.id;
}

/* ------------------------------------------------------------------------- */

export async function runAnalyticsSync(ctx: StepContext): Promise<void> {
  const channels = await ctx.prisma.channel.findMany();
  for (const channel of channels) {
    const publications = await ctx.prisma.publication.findMany({
      where: {
        youtubeVideoId: { not: null },
        privacyStatus: 'public',
        run: { channelId: channel.id },
      },
      select: { youtubeVideoId: true },
    });
    const videoIds = publications.map((p) => p.youtubeVideoId!).filter(Boolean);
    if (videoIds.length === 0) continue;

    const auth = await oauthClientForChannel(ctx.prisma, ctx.env, channel.id);
    let youtube;
    try {
      youtube = getYouTubeClient(ctx.env, auth);
    } catch {
      continue; // Not connected yet — nothing to sync.
    }
    const stats = await youtube.getVideoStats(videoIds);
    for (const [videoId, metrics] of Object.entries(stats)) {
      await ctx.prisma.analyticsSnapshot.create({
        data: { channelId: channel.id, youtubeVideoId: videoId, metrics },
      });
    }
    ctx.log.info({ channel: channel.id, videos: Object.keys(stats).length }, 'analytics synced');
  }
}

/* ------------------------------------------------------------------------- */

const RESUMABLE_STATES = [...ACTIVE_STATES, 'AWAITING_APPROVAL', 'APPROVED', 'SCHEDULED'] as const;

/**
 * Re-enqueue the current step for runs that have no live queue job — covers
 * a process crash between a state transition and its enqueue, and runs
 * parked while paused. Safe because (a) jobIds are deterministic per hour
 * bucket, and (b) every step re-validates run state before doing anything.
 */
export async function resumeRuns(ctx: StepContext): Promise<void> {
  const paused = await isSystemPaused(ctx);
  const staleBefore = new Date(Date.now() - 20 * 60 * 1000);
  const runs = await ctx.prisma.productionRun.findMany({
    where: { state: { in: [...RESUMABLE_STATES] }, updatedAt: { lt: staleBefore } },
    take: 20,
  });
  if (runs.length === 0) return;

  const stepForState = new Map<string, PipelineStep>(
    (Object.entries(STEP_ENTRY_STATE) as [PipelineStep, string][]).map(([step, state]) => [
      state,
      step,
    ]),
  );
  const hourBucket = Math.floor(Date.now() / 3_600_000);

  for (const run of runs) {
    const step = stepForState.get(run.state);
    if (!step) continue;
    if (paused && step !== 'approval') continue;
    // Supervised runs waiting on humans are not stalled.
    const channel = await ctx.prisma.channel.findUnique({ where: { id: run.channelId } });
    if (
      channel?.publishMode === 'supervised' &&
      (run.state === 'AWAITING_APPROVAL' || run.state === 'SCRIPT_REVIEW')
    ) {
      continue;
    }
    await ctx.queue.add(
      step,
      { runId: run.id, epoch: run.scriptRevisions } satisfies PipelineJobData,
      { ...DEFAULT_JOB_OPTIONS, jobId: `${run.id}-${step}-recover-${hourBucket}` },
    );
    ctx.log.info({ runId: run.id, step, state: run.state }, 'resumed stalled run');
  }
}
