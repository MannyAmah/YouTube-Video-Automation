import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { google, youtube_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import {
  ProviderError,
  UploadRequest,
  YouTubeChannelInfo,
  YouTubeClient,
  YouTubeVideoStatus,
} from './types';

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

export function createOAuthClient(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): OAuth2Client {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Real YouTube Data API v3 client.
 *
 * uploadPrivate streams the actual MP4 file (resumable upload handled by the
 * googleapis transport). It hard-fails if the file is missing, undersized,
 * or the request asks for anything other than private privacy.
 */
export class RealYouTubeClient implements YouTubeClient {
  readonly name = 'youtube';
  private readonly yt: youtube_v3.Youtube;

  constructor(private readonly auth: OAuth2Client) {
    this.yt = google.youtube({ version: 'v3', auth });
  }

  async getChannelInfo(): Promise<YouTubeChannelInfo> {
    const res = await this.yt.channels.list({ part: ['snippet'], mine: true });
    const channel = res.data.items?.[0];
    if (!channel?.id) throw new ProviderError(this.name, 'No YouTube channel for this account', false);
    return { channelId: channel.id, title: channel.snippet?.title ?? 'Unknown channel' };
  }

  async uploadPrivate(req: UploadRequest): Promise<{ videoId: string }> {
    const info = await stat(req.filePath).catch(() => null);
    if (!info || !info.isFile()) {
      throw new ProviderError(this.name, `Video file missing: ${req.filePath}`, false);
    }
    if (info.size < 100_000) {
      throw new ProviderError(this.name, `Video file too small (${info.size} bytes)`, false);
    }
    if (req.privacyStatus !== 'private') {
      throw new ProviderError(this.name, 'Policy violation: uploads must be private', false);
    }
    const res = await this.yt.videos.insert(
      {
        part: ['snippet', 'status'],
        notifySubscribers: false,
        requestBody: {
          snippet: {
            title: req.title.slice(0, 100),
            description: req.description.slice(0, 4900),
            tags: req.tags.slice(0, 30),
            categoryId: req.categoryId,
          },
          status: {
            privacyStatus: 'private',
            selfDeclaredMadeForKids: false,
          },
        },
        media: { body: createReadStream(req.filePath) },
      },
      // Resumable upload for large files.
      { onUploadProgress: () => undefined },
    );
    const videoId = res.data.id;
    if (!videoId) throw new ProviderError(this.name, 'Upload returned no video id');
    return { videoId };
  }

  async setPrivacy(videoId: string, privacy: 'private' | 'public' | 'unlisted'): Promise<void> {
    await this.yt.videos.update({
      part: ['status'],
      requestBody: { id: videoId, status: { privacyStatus: privacy } },
    });
  }

  async getVideoStatus(videoId: string): Promise<YouTubeVideoStatus> {
    const res = await this.yt.videos.list({ part: ['status', 'processingDetails'], id: [videoId] });
    const video = res.data.items?.[0];
    if (!video) throw new ProviderError(this.name, `Video ${videoId} not found`, false);
    return {
      videoId,
      uploadStatus: video.status?.uploadStatus ?? 'unknown',
      privacyStatus: video.status?.privacyStatus ?? 'unknown',
      processingStatus: video.processingDetails?.processingStatus ?? undefined,
    };
  }

  async setThumbnail(videoId: string, thumbnailPath: string): Promise<void> {
    const info = await stat(thumbnailPath).catch(() => null);
    if (!info || info.size < 5_000) {
      throw new ProviderError(this.name, `Thumbnail missing or too small: ${thumbnailPath}`, false);
    }
    await this.yt.thumbnails.set({
      videoId,
      media: { body: createReadStream(thumbnailPath) },
    });
  }

  async getVideoStats(videoIds: string[]): Promise<Record<string, Record<string, number>>> {
    if (videoIds.length === 0) return {};
    const res = await this.yt.videos.list({ part: ['statistics'], id: videoIds });
    const out: Record<string, Record<string, number>> = {};
    for (const video of res.data.items ?? []) {
      if (!video.id) continue;
      const s = video.statistics ?? {};
      out[video.id] = {
        viewCount: Number(s.viewCount ?? 0),
        likeCount: Number(s.likeCount ?? 0),
        commentCount: Number(s.commentCount ?? 0),
      };
    }
    return out;
  }

  async searchVideos(query: string, maxResults: number) {
    const res = await this.yt.search.list({
      part: ['snippet'],
      q: query,
      type: ['video'],
      maxResults,
    });
    return (res.data.items ?? [])
      .filter((i) => i.id?.videoId)
      .map((i) => ({ title: i.snippet?.title ?? '', videoId: i.id!.videoId! }));
  }
}
