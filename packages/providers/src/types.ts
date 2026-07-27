import type { ZodType, ZodTypeDef } from 'zod';

/**
 * Provider interfaces. Every adapter either succeeds with a real artifact or
 * throws ProviderError — there is no placeholder-success path anywhere.
 */

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly retryable = true,
    public override readonly cause?: unknown,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
  }
}

export class MissingProviderError extends Error {
  constructor(public readonly capability: string, hint: string) {
    super(`No provider configured for ${capability}. ${hint}`);
    this.name = 'MissingProviderError';
  }
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StructuredRequest<T> {
  system: string;
  user: string;
  // Input type is intentionally `unknown` so schemas with `.default()`/
  // `.optional()` fields (whose input differs from output) still bind T to
  // the validated output type.
  schema: ZodType<T, ZodTypeDef, unknown>;
  /** Human-readable description of the expected JSON, embedded in prompts. */
  schemaDescription: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface TextProvider {
  readonly name: string;
  /** Generate schema-validated structured output, with bounded self-repair. */
  generateStructured<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: TokenUsage }>;
}

export interface TtsResult {
  bytes: number;
  mimeType: string;
  voice: string;
  provider: string;
}

export interface TtsProvider {
  readonly name: string;
  /** Synthesize speech to `outPath` (mp3). Throws on any failure. */
  synthesize(text: string, outPath: string): Promise<TtsResult>;
}

export interface ImageResult {
  bytes: number;
  mimeType: string;
  provider: string;
}

export interface ImageProvider {
  readonly name: string;
  /** Generate a 16:9 image to `outPath` (png). Throws on any failure. */
  generate(prompt: string, outPath: string): Promise<ImageResult>;
}

export interface UploadRequest {
  filePath: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacyStatus: 'private';
  /** Idempotency key — runId; the client must refuse a duplicate upload. */
  runId: string;
}

export interface YouTubeChannelInfo {
  channelId: string;
  title: string;
}

export interface YouTubeVideoStatus {
  videoId: string;
  uploadStatus: string;
  privacyStatus: string;
  processingStatus?: string;
}

export interface YouTubeClient {
  readonly name: string;
  getChannelInfo(): Promise<YouTubeChannelInfo>;
  uploadPrivate(req: UploadRequest): Promise<{ videoId: string }>;
  setPrivacy(videoId: string, privacy: 'private' | 'public' | 'unlisted'): Promise<void>;
  getVideoStatus(videoId: string): Promise<YouTubeVideoStatus>;
  setThumbnail(videoId: string, thumbnailPath: string): Promise<void>;
  getVideoStats(videoIds: string[]): Promise<Record<string, Record<string, number>>>;
  /** Search public YouTube for topic-idea signals (optional capability). */
  searchVideos?(query: string, maxResults: number): Promise<{ title: string; videoId: string }[]>;
}
