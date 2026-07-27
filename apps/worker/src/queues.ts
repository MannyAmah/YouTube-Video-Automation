import { JobsOptions, Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { PipelineStep } from '@yva/shared';

/**
 * Queue topology.
 *
 * pipeline  — one job per (run, step). Deterministic jobIds make enqueues
 *             idempotent: re-adding an existing (run, step, epoch) job is a
 *             no-op, so duplicate schedules or crash-recovery cannot create
 *             duplicate work. Steps additionally guard on run state.
 * scheduler — repeatable jobs (daily brief creation, analytics sync).
 */

export const PIPELINE_QUEUE = 'pipeline';
export const SCHEDULER_QUEUE = 'scheduler';

export function createRedis(url: string): IORedis {
  return new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: false });
}

export interface PipelineJobData {
  runId: string;
  /** Increments when a run re-enters an earlier step (script revisions). */
  epoch: number;
}

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },
  removeOnFail: { age: 30 * 24 * 3600 },
};

export function pipelineJobId(runId: string, step: PipelineStep, epoch: number): string {
  return `${runId}:${step}:e${epoch}`;
}

export async function enqueueStep(
  queue: Queue<PipelineJobData>,
  runId: string,
  step: PipelineStep,
  epoch: number,
  extraOptions: JobsOptions = {},
): Promise<void> {
  await queue.add(step, { runId, epoch }, {
    ...DEFAULT_JOB_OPTIONS,
    ...extraOptions,
    jobId: pipelineJobId(runId, step, epoch),
  });
}
