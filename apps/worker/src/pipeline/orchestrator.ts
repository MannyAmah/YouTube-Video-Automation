import type { Job } from 'bullmq';
import { StaleRunStateError, runStateTransition, getRunChecked } from '@yva/db';
import { MissingProviderError } from '@yva/providers';
import { PipelineStep, PIPELINE_STEPS, STEP_ENTRY_STATE } from '@yva/shared';
import type { StepContext } from './context';
import { isSystemPaused } from './context';
import {
  stepResearch,
  stepScript,
  stepScriptReview,
  stepStoryboard,
} from './steps-content';
import { stepAssets, stepQualityCheck, stepRender } from './steps-media';
import { stepApproval, stepPublish, stepUpload } from './steps-publish';
import type { PipelineJobData } from '../queues';

type StepHandler = (ctx: StepContext, runId: string, epoch: number) => Promise<void>;

const HANDLERS: Partial<Record<PipelineStep, StepHandler>> = {
  research: stepResearch,
  script: stepScript,
  script_review: stepScriptReview,
  storyboard: stepStoryboard,
  assets: stepAssets,
  render: stepRender,
  quality_check: stepQualityCheck,
  approval: stepApproval,
  upload: stepUpload,
  publish: stepPublish,
};

/**
 * Process one pipeline job. Responsibilities:
 *  - honor the emergency pause (park the job by delaying it);
 *  - guard on run state (stale/duplicate jobs complete as no-ops);
 *  - record JobEvents for observability;
 *  - convert final-attempt failures into a FAILED run with a retry target.
 */
export async function processPipelineJob(ctx: StepContext, job: Job<PipelineJobData>): Promise<void> {
  const step = job.name as PipelineStep;
  const { runId, epoch } = job.data;
  const startedAt = Date.now();

  if (!PIPELINE_STEPS.includes(step) || !HANDLERS[step]) {
    throw new Error(`Unknown pipeline step: ${job.name}`);
  }

  const paused = await isSystemPaused(ctx);
  if (paused && step !== 'approval') {
    // Approval handles pause itself (it parks the run). Everything else is
    // retried later via delayed re-processing.
    ctx.log.warn({ runId, step, paused }, 'job deferred: emergency pause');
    throw new Error(`Deferred by emergency pause: ${paused}`);
  }

  // State guard: only the step matching the run's current state may execute.
  const run = await getRunChecked(ctx.prisma, runId);
  const expected = STEP_ENTRY_STATE[step];
  if (run.state !== expected) {
    ctx.log.info(
      { runId, step, state: run.state, expected },
      'skipping stale job (state mismatch)',
    );
    return;
  }

  await ctx.prisma.jobEvent.create({
    data: { runId, step, jobId: String(job.id), attempt: job.attemptsMade + 1, status: 'started' },
  });

  try {
    await HANDLERS[step]!(ctx, runId, epoch);
    await ctx.prisma.jobEvent.create({
      data: {
        runId,
        step,
        jobId: String(job.id),
        attempt: job.attemptsMade + 1,
        status: 'completed',
        durationMs: Date.now() - startedAt,
      },
    });
  } catch (err) {
    if (err instanceof StaleRunStateError) {
      // A concurrent worker already advanced the run — benign.
      ctx.log.info({ runId, step, err: err.message }, 'stale transition; treating as no-op');
      return;
    }
    const message = (err as Error).message?.slice(0, 2000) ?? 'unknown error';
    await ctx.prisma.jobEvent.create({
      data: {
        runId,
        step,
        jobId: String(job.id),
        attempt: job.attemptsMade + 1,
        status: 'failed',
        detail: message,
        durationMs: Date.now() - startedAt,
      },
    });

    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const permanent = err instanceof MissingProviderError;
    if (isFinalAttempt || permanent) {
      const current = await getRunChecked(ctx.prisma, runId).catch(() => null);
      if (current && current.state === expected) {
        await runStateTransition(ctx.prisma, runId, expected, 'FAILED', {
          failureReason: `Step ${step} failed: ${message}`,
          retryTargetState: expected,
        }).catch((e) => ctx.log.error({ runId, err: e.message }, 'could not mark run FAILED'));
      }
      if (permanent) {
        ctx.log.error({ runId, step, err: message }, 'permanent failure (missing provider)');
        return; // Do not burn retries on config errors.
      }
    }
    throw err;
  }
}
