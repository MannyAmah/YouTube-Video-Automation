// YouTube publish — ported and cleaned from the legacy reference tool's
// publishing-scheduling-agent.js + oauth-server.js (preserved on the
// `legacy/reference-tool` branch). This is the one piece worth salvaging:
// a working googleapis OAuth2 + videos.insert flow. Rewritten in strict TS,
// with the PLAN §6 disclaimer guarantee enforced at the publish boundary.

import { google, type youtube_v3 } from 'googleapis';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { Config } from '../config.js';

export interface PublishInput {
  videoPath: string;
  title: string;
  description: string;
  tags: string[];
  /** Spoken/on-screen disclaimer text — REQUIRED. Its hash is logged (§3.3). */
  disclaimer: string;
  visibility?: 'public' | 'unlisted' | 'private';
  publishAt?: string; // ISO; if set, schedules instead of publishing now
}

export interface PublishResult {
  youtubeId: string;
  disclaimerHash: string;
}

function youtubeClient(cfg: Config): youtube_v3.Youtube {
  if (!cfg.YOUTUBE_CLIENT_ID || !cfg.YOUTUBE_CLIENT_SECRET || !cfg.YOUTUBE_REFRESH_TOKEN) {
    throw new Error('YouTube OAuth not configured (client id/secret/refresh token).');
  }
  const auth = new google.auth.OAuth2(
    cfg.YOUTUBE_CLIENT_ID,
    cfg.YOUTUBE_CLIENT_SECRET,
    cfg.YOUTUBE_REDIRECT_URI,
  );
  auth.setCredentials({ refresh_token: cfg.YOUTUBE_REFRESH_TOKEN });
  return google.youtube({ version: 'v3', auth });
}

export async function publishVideo(cfg: Config, input: PublishInput): Promise<PublishResult> {
  // Compliance guard: nothing publishes without a disclaimer (PLAN §6 / §14).
  if (!input.disclaimer.trim()) {
    throw new Error('refusing to publish: empty disclaimer (PLAN §6 requires one).');
  }
  const disclaimerHash = createHash('sha256').update(input.disclaimer).digest('hex');

  const youtube = youtubeClient(cfg);
  const description = `${input.description}\n\n— — —\n${input.disclaimer}`;

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: input.title,
        description,
        tags: input.tags,
        categoryId: '27', // Education
      },
      status: {
        privacyStatus: input.publishAt ? 'private' : (input.visibility ?? 'public'),
        selfDeclaredMadeForKids: false,
        ...(input.publishAt ? { publishAt: input.publishAt } : {}),
      },
    },
    media: { body: createReadStream(input.videoPath) },
  });

  const youtubeId = res.data.id;
  if (!youtubeId) throw new Error('YouTube insert returned no video id');
  return { youtubeId, disclaimerHash };
}
