import type { Queue } from 'bullmq';
import type { PrismaClient } from '@yva/db';
import type { Env, Logger } from '@yva/shared';
import type { ArtifactStore } from '../artifacts';
import type { PipelineJobData } from '../queues';

export interface StepContext {
  prisma: PrismaClient;
  env: Env;
  log: Logger;
  store: ArtifactStore;
  queue: Queue<PipelineJobData>;
}

/** Thrown when a run is (or becomes) paused; the job is parked, not failed. */
export class PipelinePausedError extends Error {
  constructor(reason: string) {
    super(`Pipeline paused: ${reason}`);
    this.name = 'PipelinePausedError';
  }
}

export async function isSystemPaused(ctx: StepContext): Promise<string | null> {
  if (ctx.env.EMERGENCY_PAUSE) return 'EMERGENCY_PAUSE environment flag is set';
  const setting = await ctx.prisma.setting.findUnique({ where: { key: 'emergencyPause' } });
  if (setting && setting.value === true) return 'emergency pause enabled in settings';
  return null;
}
