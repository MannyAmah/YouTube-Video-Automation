import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { z } from 'zod';
import type { PrismaClient } from '@yva/db';
import { Env, Logger, providerStatus } from '@yva/shared';
import { AuthGuard } from './auth';
import { ENV, LOG, PIPELINE_Q, PRISMA } from './tokens';

/** Health, provider status, channel policy, pause switch, analytics. */

@Controller()
export class SystemController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    @Inject(PIPELINE_Q) private readonly queue: Queue,
    @Inject(LOG) private readonly log: Logger,
  ) {}

  /** Unauthenticated liveness/readiness for Railway healthchecks. */
  @Get('healthz')
  async healthz() {
    const checks: Record<string, boolean> = {};
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      checks.database = false;
    }
    try {
      const client = (await this.queue.client) as unknown as { ping(): Promise<string> };
      await client.ping();
      checks.redis = true;
    } catch {
      checks.redis = false;
    }
    const ok = Object.values(checks).every(Boolean);
    return { ok, service: 'api', checks };
  }

  @Get('status')
  @UseGuards(AuthGuard)
  async status() {
    const [channel, pauseSetting, queueCounts, runStates] = await Promise.all([
      this.prisma.channel.findFirst({ include: { oauthConnection: true } }),
      this.prisma.setting.findUnique({ where: { key: 'emergencyPause' } }),
      this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
      this.prisma.productionRun.groupBy({ by: ['state'], _count: true }),
    ]);
    return {
      providers: providerStatus(this.env),
      publishMode: channel?.publishMode ?? this.env.PUBLISH_MODE,
      emergencyPause: this.env.EMERGENCY_PAUSE || pauseSetting?.value === true,
      channel: channel
        ? {
            id: channel.id,
            title: channel.title,
            youtubeChannelId: channel.youtubeChannelId,
            connected: Boolean(channel.oauthConnection && !channel.oauthConnection.revokedAt),
            paused: channel.paused,
            maxPublishesPerDay: channel.maxPublishesPerDay,
          }
        : null,
      queue: queueCounts,
      runStates: Object.fromEntries(runStates.map((r) => [r.state, r._count])),
      testMode: this.env.TEST_MODE,
    };
  }

  @Post('settings/pause')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async setPause(@Body() body: unknown) {
    const parsed = z.object({ paused: z.boolean() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Expected { paused: boolean }');
    await this.prisma.setting.upsert({
      where: { key: 'emergencyPause' },
      create: { key: 'emergencyPause', value: parsed.data.paused },
      update: { value: parsed.data.paused },
    });
    this.log.warn({ paused: parsed.data.paused }, 'emergency pause toggled');
    return { ok: true, paused: parsed.data.paused };
  }

  @Patch('channels/:id')
  @UseGuards(AuthGuard)
  async updateChannel(@Param('id') id: string, @Body() body: unknown) {
    const schema = z.object({
      publishMode: z.enum(['autonomous', 'supervised']).optional(),
      paused: z.boolean().optional(),
      maxPublishesPerDay: z.number().int().min(0).max(24).optional(),
      title: z.string().min(1).max(120).optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
    const channel = await this.prisma.channel.update({ where: { id }, data: parsed.data });
    this.log.info({ channelId: id, changes: parsed.data }, 'channel policy updated');
    return channel;
  }

  @Get('analytics')
  @UseGuards(AuthGuard)
  async analytics(): Promise<unknown> {
    const snapshots = await this.prisma.analyticsSnapshot.findMany({
      orderBy: { capturedAt: 'desc' },
      take: 500,
    });
    const publications = await this.prisma.publication.findMany({
      where: { youtubeVideoId: { not: null } },
      include: { run: { include: { brief: { select: { medicationQuery: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      publications: publications.map((p) => ({
        runId: p.runId,
        medication: p.run.brief.medicationQuery,
        youtubeVideoId: p.youtubeVideoId,
        privacyStatus: p.privacyStatus,
        publishedAt: p.publishedAt,
      })),
      snapshots,
    };
  }
}
