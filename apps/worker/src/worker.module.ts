import { Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { createServer, Server } from 'http';
import { getPrisma, disconnectPrisma } from '@yva/db';
import { createLogger, internalArtifactToken, loadEnv } from '@yva/shared';
import { ArtifactStore } from './artifacts';
import { processPipelineJob } from './pipeline/orchestrator';
import type { StepContext } from './pipeline/context';
import { processSchedulerJob, registerSchedules } from './scheduler';
import { createRedis, PIPELINE_QUEUE, SCHEDULER_QUEUE, PipelineJobData } from './queues';

const internalToken = internalArtifactToken;

/**
 * NestJS standalone worker service. Owns the BullMQ workers, the durable
 * schedules, and a small health endpoint (Railway healthcheck target) that
 * also serves artifact files to the API over private networking.
 */
@Injectable()
export class WorkerService implements OnModuleDestroy {
  private readonly env = loadEnv();
  private readonly log = createLogger('worker');
  private readonly prisma = getPrisma();
  private readonly connection = createRedis(this.env.REDIS_URL);
  private pipelineQueue!: Queue<PipelineJobData>;
  private schedulerQueue!: Queue;
  private workers: Worker[] = [];
  private health?: Server;

  async start(): Promise<void> {
    this.pipelineQueue = new Queue<PipelineJobData>(PIPELINE_QUEUE, {
      connection: this.connection,
    });
    this.schedulerQueue = new Queue(SCHEDULER_QUEUE, { connection: this.connection });
    await registerSchedules(this.schedulerQueue);

    const ctx: StepContext = {
      prisma: this.prisma,
      env: this.env,
      log: this.log,
      store: new ArtifactStore(this.prisma, this.env.MEDIA_ROOT),
      queue: this.pipelineQueue,
    };

    this.workers = [
      new Worker<PipelineJobData>(PIPELINE_QUEUE, (job) => processPipelineJob(ctx, job), {
        connection: createRedis(this.env.REDIS_URL),
        concurrency: 2,
        stalledInterval: 60_000,
        lockDuration: 10 * 60_000, // renders and uploads are long-running
      }),
      new Worker(SCHEDULER_QUEUE, (job) => processSchedulerJob(ctx, job), {
        connection: createRedis(this.env.REDIS_URL),
        concurrency: 1,
      }),
    ];
    for (const worker of this.workers) {
      worker.on('failed', (job, err) =>
        this.log.error({ jobId: job?.id, name: job?.name, err: err.message }, 'job failed'),
      );
      worker.on('error', (err) => this.log.error({ err: err.message }, 'worker error'));
    }

    this.startHealthServer();
    this.log.info(
      { port: this.env.APP_PORT, testMode: this.env.TEST_MODE, publishMode: this.env.PUBLISH_MODE },
      'worker started',
    );
  }

  private startHealthServer(): void {
    const store = new ArtifactStore(this.prisma, this.env.MEDIA_ROOT);
    this.health = createServer(async (req, res) => {
      // Internal artifact file server for the API service (Railway private
      // networking). Guarded by an HMAC token derived from SESSION_SECRET.
      if (req.url?.startsWith('/internal/artifacts/')) {
        const token = req.headers['x-internal-token'];
        if (token !== internalToken(this.env.SESSION_SECRET)) {
          res.writeHead(403);
          res.end();
          return;
        }
        try {
          const relative = decodeURIComponent(req.url.slice('/internal/artifacts/'.length));
          const abs = store.absolutePath(relative); // contains path-escape guard
          const { createReadStream, statSync } = await import('fs');
          const info = statSync(abs);
          res.writeHead(200, { 'content-length': info.size });
          createReadStream(abs).pipe(res);
        } catch {
          res.writeHead(404);
          res.end();
        }
        return;
      }
      if (req.url === '/healthz') {
        try {
          await this.prisma.$queryRaw`SELECT 1`;
          await this.connection.ping();
          const counts = await this.pipelineQueue.getJobCounts(
            'waiting',
            'active',
            'delayed',
            'failed',
          );
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true, service: 'worker', queue: counts }));
        } catch (err) {
          res.writeHead(503, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
        }
        return;
      }
      res.writeHead(404);
      res.end();
    });
    this.health.listen(this.env.APP_PORT);
  }

  async onModuleDestroy(): Promise<void> {
    this.health?.close();
    await Promise.all(this.workers.map((w) => w.close()));
    await this.pipelineQueue?.close();
    await this.schedulerQueue?.close();
    this.connection.disconnect();
    await disconnectPrisma();
  }
}

@Module({ providers: [WorkerService] })
export class WorkerModule {}
