import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Queue } from 'bullmq';
import { existsSync } from 'fs';
import { Readable } from 'stream';
import { z } from 'zod';
import { ArtifactStore, getRunChecked, PrismaClient, runStateTransition } from '@yva/db';
import {
  Env,
  internalArtifactToken,
  isRunState,
  Logger,
  PipelineStep,
  RunState,
  STEP_ENTRY_STATE,
} from '@yva/shared';
import { AuthGuard } from './auth';
import { ENV, LOG, PIPELINE_Q, PRISMA, STORE } from './tokens';
import { DEFAULT_JOB_OPTIONS } from './queue-options';

const StartRunSchema = z.object({
  medication: z.string().min(2).max(80),
  channelId: z.string().optional(),
});

@Controller('runs')
@UseGuards(AuthGuard)
export class RunsController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    @Inject(PIPELINE_Q) private readonly queue: Queue,
    @Inject(STORE) private readonly store: ArtifactStore,
    @Inject(LOG) private readonly log: Logger,
  ) {}

  @Get()
  async list() {
    const runs = await this.prisma.productionRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        brief: { select: { medicationQuery: true, angle: true } },
        publication: { select: { youtubeVideoId: true, privacyStatus: true, publishedAt: true } },
      },
    });
    return runs;
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<unknown> {
    const run = await this.prisma.productionRun.findUnique({
      where: { id },
      include: {
        brief: true,
        publication: true,
        approvals: { orderBy: { createdAt: 'asc' } },
        artifacts: { orderBy: { createdAt: 'asc' } },
        scripts: { orderBy: { version: 'desc' }, take: 1 },
        jobEvents: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!run) throw new NotFoundException();
    return run;
  }

  @Post()
  @HttpCode(202)
  async start(@Body() body: unknown, @Req() req: Request) {
    const parsed = StartRunSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    const channel = parsed.data.channelId
      ? await this.prisma.channel.findUnique({ where: { id: parsed.data.channelId } })
      : await this.prisma.channel.findFirst();
    if (!channel) throw new BadRequestException('No channel');

    const brief = await this.prisma.contentBrief.create({
      data: {
        channelId: channel.id,
        medicationQuery: parsed.data.medication,
        createdBy: 'admin',
        status: 'in_production',
        audienceNote:
          'Patients and caregivers with no medical background. Explain like the viewer is five years old, using visual metaphors, without being condescending.',
      },
    });
    const run = await this.prisma.productionRun.create({
      data: { channelId: channel.id, briefId: brief.id, state: 'RESEARCHING' },
    });
    await this.enqueue(run.id, 'research', 0);
    this.log.info(
      { runId: run.id, medication: parsed.data.medication, by: this.actor(req) },
      'run started manually',
    );
    return { runId: run.id };
  }

  /** Supervised-mode: approve the script and continue to storyboarding. */
  @Post(':id/approve-script')
  @HttpCode(200)
  async approveScript(@Param('id') id: string, @Req() req: Request) {
    const run = await getRunChecked(this.prisma, id);
    if (run.state !== 'SCRIPT_REVIEW') {
      throw new BadRequestException(`Run is ${run.state}, not SCRIPT_REVIEW`);
    }
    await this.recordHumanApproval(id, 'script', req);
    await runStateTransition(this.prisma, id, 'SCRIPT_REVIEW', 'STORYBOARDING');
    await this.enqueue(id, 'storyboard', run.scriptRevisions);
    return { ok: true };
  }

  /** Supervised-mode: approve the finished video for private upload. */
  @Post(':id/approve-upload')
  @HttpCode(200)
  async approveUpload(@Param('id') id: string, @Req() req: Request) {
    const run = await getRunChecked(this.prisma, id);
    if (run.state !== 'AWAITING_APPROVAL') {
      throw new BadRequestException(`Run is ${run.state}, not AWAITING_APPROVAL`);
    }
    await this.recordHumanApproval(id, 'upload', req);
    await runStateTransition(this.prisma, id, 'AWAITING_APPROVAL', 'APPROVED');
    await this.enqueue(id, 'upload', run.scriptRevisions);
    return { ok: true };
  }

  /** Supervised-mode: publish an uploaded private video. */
  @Post(':id/publish')
  @HttpCode(200)
  async publish(@Param('id') id: string, @Req() req: Request) {
    const run = await getRunChecked(this.prisma, id);
    if (run.state !== 'UPLOADED_PRIVATE') {
      throw new BadRequestException(`Run is ${run.state}, not UPLOADED_PRIVATE`);
    }
    await this.recordHumanApproval(id, 'publish', req);
    await this.prisma.publication.update({
      where: { runId: id },
      data: { scheduledFor: new Date() },
    });
    await runStateTransition(this.prisma, id, 'UPLOADED_PRIVATE', 'SCHEDULED');
    await this.enqueue(id, 'publish', run.scriptRevisions);
    return { ok: true };
  }

  /** Send a script back for revision (supervised mode). */
  @Post(':id/reject-script')
  @HttpCode(200)
  async rejectScript(@Param('id') id: string, @Body() body: { notes?: string }, @Req() req: Request) {
    const run = await getRunChecked(this.prisma, id);
    if (run.state !== 'SCRIPT_REVIEW') {
      throw new BadRequestException(`Run is ${run.state}, not SCRIPT_REVIEW`);
    }
    const script = await this.prisma.script.findFirst({
      where: { runId: id },
      orderBy: { version: 'desc' },
    });
    if (script) {
      await this.prisma.script.update({
        where: { id: script.id },
        data: { review: { ok: false, failures: [body.notes ?? 'Rejected by reviewer'] } },
      });
    }
    await this.prisma.approval.create({
      data: {
        runId: id,
        stage: 'script',
        decision: 'rejected',
        actorType: 'human',
        actorId: this.actorId(req),
        notes: body.notes ?? null,
      },
    });
    await runStateTransition(this.prisma, id, 'SCRIPT_REVIEW', 'SCRIPTING', {
      scriptRevisions: run.scriptRevisions + 1,
    });
    await this.enqueue(id, 'script', run.scriptRevisions + 1);
    return { ok: true };
  }

  @Post(':id/retry')
  @HttpCode(200)
  async retry(@Param('id') id: string) {
    const run = await getRunChecked(this.prisma, id);
    if (run.state !== 'FAILED') throw new BadRequestException(`Run is ${run.state}, not FAILED`);
    const target = run.retryTargetState;
    if (!target || !isRunState(target)) {
      throw new BadRequestException('Run has no retry target');
    }
    const step = (Object.entries(STEP_ENTRY_STATE) as [PipelineStep, RunState][]).find(
      ([, state]) => state === target,
    )?.[0];
    if (!step) throw new BadRequestException(`No step re-enters state ${target}`);
    await runStateTransition(this.prisma, id, 'FAILED', target, { failureReason: null });
    await this.enqueue(id, step, run.scriptRevisions, `retry:${Date.now()}`);
    return { ok: true, resumedAt: target };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Param('id') id: string) {
    const run = await getRunChecked(this.prisma, id);
    if (run.state === 'PUBLISHED' || run.state === 'CANCELLED') {
      throw new BadRequestException(`Run is already ${run.state}`);
    }
    await runStateTransition(this.prisma, id, run.state, 'CANCELLED');
    await this.prisma.contentBrief.update({
      where: { id: run.briefId },
      data: { status: 'abandoned' },
    });
    return { ok: true };
  }

  @Get(':id/artifacts/:artifactId/file')
  async artifactFile(
    @Param('id') id: string,
    @Param('artifactId') artifactId: string,
    @Res() res: Response,
  ) {
    const artifact = await this.prisma.artifact.findUnique({ where: { id: artifactId } });
    if (!artifact || artifact.runId !== id) throw new NotFoundException();
    const abs = this.store.absolutePath(artifact.relativePath);
    res.setHeader('content-type', artifact.mimeType);
    if (existsSync(abs)) {
      res.sendFile(abs);
      return;
    }
    // Two-service topology: the media volume lives on the worker — proxy.
    if (!this.env.WORKER_INTERNAL_URL) throw new NotFoundException('Artifact file not available');
    const upstream = await fetch(
      `${this.env.WORKER_INTERNAL_URL}/internal/artifacts/${encodeURIComponent(artifact.relativePath)}`,
      { headers: { 'x-internal-token': internalArtifactToken(this.env.SESSION_SECRET) } },
    );
    if (!upstream.ok || !upstream.body) throw new NotFoundException('Artifact file not available');
    res.setHeader('content-length', upstream.headers.get('content-length') ?? '');
    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
  }

  private async enqueue(
    runId: string,
    step: PipelineStep,
    epoch: number,
    suffix = '',
  ): Promise<void> {
    await this.queue.add(step, { runId, epoch }, {
      ...DEFAULT_JOB_OPTIONS,
      jobId: `${runId}:${step}:e${epoch}${suffix ? `:${suffix}` : ''}`,
    });
  }

  private actor(req: Request): string {
    return (req as Request & { user?: { email: string } }).user?.email ?? 'unknown';
  }

  private actorId(req: Request): string | null {
    return (req as Request & { user?: { id: string } }).user?.id ?? null;
  }

  private async recordHumanApproval(runId: string, stage: string, req: Request): Promise<void> {
    await this.prisma.approval.create({
      data: {
        runId,
        stage,
        decision: 'approved',
        actorType: 'human',
        actorId: this.actorId(req),
      },
    });
  }
}
