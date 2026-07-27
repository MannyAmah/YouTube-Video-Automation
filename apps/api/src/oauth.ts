import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { PrismaClient } from '@yva/db';
import { Env, encryptSecret, Logger } from '@yva/shared';
import { createOAuthClient, getYouTubeClient, YOUTUBE_SCOPES } from '@yva/providers';
import { AuthGuard } from './auth';
import { ENV, LOG, PRISMA } from './tokens';

/**
 * Google OAuth for YouTube.
 *
 * One flow, web-based, with an HMAC-signed state parameter (channel id +
 * nonce + expiry) to prevent login CSRF. The refresh token is encrypted
 * with APP_ENCRYPTION_KEY before it touches the database. Tokens never
 * appear in logs or API responses.
 */

interface StatePayload {
  channelId: string;
  nonce: string;
  exp: number;
}

function signState(payload: StatePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verifyState(state: string, secret: string): StatePayload | null {
  const [body, mac] = state.split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  const actual = Buffer.from(mac, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as StatePayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

@Controller('oauth/google')
export class OAuthController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    @Inject(LOG) private readonly log: Logger,
  ) {}

  private redirectUri(): string {
    return `${this.env.PUBLIC_URL}/api/oauth/google/callback`;
  }

  @Get('start')
  @UseGuards(AuthGuard)
  async start(@Query('channelId') channelId: string | undefined, @Res() res: Response) {
    if (!this.env.GOOGLE_CLIENT_ID || !this.env.GOOGLE_CLIENT_SECRET) {
      throw new BadRequestException(
        'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured (docs/GOOGLE_YOUTUBE_OAUTH.md)',
      );
    }
    const channel = channelId
      ? await this.prisma.channel.findUnique({ where: { id: channelId } })
      : await this.prisma.channel.findFirst();
    if (!channel) throw new BadRequestException('No channel exists');

    const state = signState(
      { channelId: channel.id, nonce: randomBytes(16).toString('hex'), exp: Date.now() + 600_000 },
      this.env.SESSION_SECRET,
    );
    const client = createOAuthClient(
      this.env.GOOGLE_CLIENT_ID,
      this.env.GOOGLE_CLIENT_SECRET,
      this.redirectUri(),
    );
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: YOUTUBE_SCOPES,
      state,
    });
    res.redirect(url);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    if (error) {
      res.redirect(`/?oauth=denied`);
      return;
    }
    if (!code || !state) throw new BadRequestException('Missing code/state');
    const payload = verifyState(state, this.env.SESSION_SECRET);
    if (!payload) throw new BadRequestException('Invalid or expired OAuth state');

    const client = createOAuthClient(
      this.env.GOOGLE_CLIENT_ID,
      this.env.GOOGLE_CLIENT_SECRET,
      this.redirectUri(),
    );
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new BadRequestException(
        'Google did not return a refresh token. Remove prior access at myaccount.google.com/permissions and retry.',
      );
    }
    client.setCredentials(tokens);

    // Verify the connected account actually has a YouTube channel.
    const youtube = getYouTubeClient({ ...this.env, TEST_MODE: false } as Env, client);
    const info = await youtube.getChannelInfo();

    const encrypted = encryptSecret(tokens.refresh_token, this.env.APP_ENCRYPTION_KEY);
    await this.prisma.$transaction([
      this.prisma.oAuthConnection.upsert({
        where: { channelId: payload.channelId },
        create: {
          channelId: payload.channelId,
          encryptedRefreshToken: encrypted,
          scopes: tokens.scope?.split(' ') ?? YOUTUBE_SCOPES,
        },
        update: {
          encryptedRefreshToken: encrypted,
          scopes: tokens.scope?.split(' ') ?? YOUTUBE_SCOPES,
          revokedAt: null,
          lastRefreshedAt: new Date(),
        },
      }),
      this.prisma.channel.update({
        where: { id: payload.channelId },
        data: { youtubeChannelId: info.channelId, title: info.title },
      }),
    ]);
    this.log.info({ channelId: payload.channelId, youtubeChannelId: info.channelId }, 'oauth connected');
    res.redirect('/?oauth=connected');
  }
}
