import 'reflect-metadata';
import { Queue } from 'bullmq';
import { getPrisma, getRunChecked, disconnectPrisma } from '@yva/db';
import { createLogger, loadEnv, TERMINAL_STATES } from '@yva/shared';
import { ArtifactStore } from './artifacts';
import type { StepContext } from './pipeline/context';
import {
  stepResearch,
  stepScript,
  stepScriptReview,
  stepStoryboard,
} from './pipeline/steps-content';
import { stepAssets, stepQualityCheck, stepRender } from './pipeline/steps-media';
import { stepApproval, stepPublish, stepUpload } from './pipeline/steps-publish';
import { startRunForMedication } from './scheduler';
import { createRedis, PIPELINE_QUEUE, PipelineJobData } from './queues';

/**
 * End-to-end pipeline driver: executes every step in-process (no queue
 * consumption) for one medication, from research through publish decision.
 * Used by `pnpm e2e:pipeline [medication]` and the release verification.
 *
 * With TEST_MODE=true this uses real FDA/NIH research, offline fake
 * providers for AI/TTS/images, real FFmpeg rendering, real ffprobe QC, and
 * the fake YouTube client — a complete rehearsal that can never touch a
 * real channel.
 */
async function main() {
  const medication = process.argv[2] ?? 'metformin';
  const env = loadEnv();
  const log = createLogger('e2e-pipeline');
  const prisma = getPrisma();
  const connection = createRedis(env.REDIS_URL);
  const queue = new Queue<PipelineJobData>(PIPELINE_QUEUE, { connection });

  const ctx: StepContext = {
    prisma,
    env,
    log,
    store: new ArtifactStore(prisma, env.MEDIA_ROOT),
    queue,
  };

  log.info({ medication, testMode: env.TEST_MODE }, 'starting end-to-end pipeline');
  const channel = await prisma.channel.findFirstOrThrow();
  const runId = await startRunForMedication(ctx, channel.id, medication, 'admin');
  // Drain the queue jobs we would otherwise duplicate — this driver runs
  // steps in-process instead.
  await queue.drain();

  // Drive the pipeline off the state machine itself: run whichever step the
  // run's current state calls for, exactly as the queue worker would.
  const handlers: Record<string, (c: StepContext, r: string, e: number) => Promise<void>> = {
    RESEARCHING: stepResearch,
    SCRIPTING: stepScript,
    SCRIPT_REVIEW: stepScriptReview,
    STORYBOARDING: stepStoryboard,
    GENERATING_ASSETS: stepAssets,
    RENDERING: stepRender,
    QUALITY_CHECK: stepQualityCheck,
    AWAITING_APPROVAL: stepApproval,
    APPROVED: stepUpload,
    SCHEDULED: stepPublish,
  };

  for (let i = 0; i < 40; i++) {
    const current = await getRunChecked(prisma, runId);
    if (
      (TERMINAL_STATES as readonly string[]).includes(current.state) ||
      current.state === 'FAILED' ||
      current.state === 'UPLOADED_PRIVATE' // supervised stop-point
    ) {
      break;
    }
    const handler = handlers[current.state];
    if (!handler) break;
    log.info({ state: current.state, epoch: current.scriptRevisions }, 'running step');
    await handler(ctx, runId, current.scriptRevisions);
    await queue.drain(); // steps enqueue their successor; we drive manually
  }

  const run = await getRunChecked(prisma, runId);
  const artifacts = await prisma.artifact.findMany({ where: { runId } });
  const publication = await prisma.publication.findUnique({ where: { runId } });

  const summary = {
    runId,
    finalState: run.state,
    failureReason: run.failureReason,
    artifacts: artifacts.map((a) => ({ kind: a.kind, path: a.relativePath, bytes: a.bytes })),
    youtubeVideoId: publication?.youtubeVideoId ?? null,
    privacyStatus: publication?.privacyStatus ?? null,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));

  await queue.close();
  connection.disconnect();
  await disconnectPrisma();

  if (run.state !== 'PUBLISHED' && run.state !== 'UPLOADED_PRIVATE' && run.state !== 'SCHEDULED') {
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('e2e pipeline failed:', err);
  process.exit(1);
});
