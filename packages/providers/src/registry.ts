import type { Env } from '@yva/shared';
import type { OAuth2Client } from 'google-auth-library';
import {
  FakeImageProvider,
  FakeTextProvider,
  FakeTtsProvider,
  FakeYouTubeClient,
} from './fakes';
import { OpenAiImageProvider } from './openai-image';
import { OpenAiTextProvider } from './openai-text';
import { ElevenLabsTtsProvider, FallbackTtsProvider, OpenAiTtsProvider } from './tts';
import { MissingProviderError, ImageProvider, TextProvider, TtsProvider, YouTubeClient } from './types';
import { RealYouTubeClient } from './youtube';

/**
 * Provider registry — the ONLY place providers are constructed.
 *
 * TEST_MODE=true swaps in offline fakes (real files, deterministic content,
 * no network, no YouTube). Otherwise a missing key raises
 * MissingProviderError, which fails the step with a clear operator message —
 * never a placeholder success.
 */

export function getTextProvider(env: Env): TextProvider {
  if (env.TEST_MODE) return new FakeTextProvider();
  if (!env.OPENAI_API_KEY) {
    throw new MissingProviderError('text generation', 'Set OPENAI_API_KEY (docs/AI_PROVIDERS.md).');
  }
  return new OpenAiTextProvider(env.OPENAI_API_KEY);
}

export function getTtsProvider(env: Env): TtsProvider {
  if (env.TEST_MODE) return new FakeTtsProvider();
  const eleven = env.ELEVENLABS_API_KEY
    ? new ElevenLabsTtsProvider(env.ELEVENLABS_API_KEY)
    : null;
  const openai = env.OPENAI_API_KEY ? new OpenAiTtsProvider(env.OPENAI_API_KEY) : null;
  if (eleven && openai) return new FallbackTtsProvider(eleven, openai);
  if (eleven) return eleven;
  if (openai) return openai;
  throw new MissingProviderError(
    'narration (TTS)',
    'Set ELEVENLABS_API_KEY (preferred) or OPENAI_API_KEY (docs/AI_PROVIDERS.md).',
  );
}

export function getImageProvider(env: Env): ImageProvider {
  if (env.TEST_MODE) return new FakeImageProvider();
  if (!env.OPENAI_API_KEY) {
    throw new MissingProviderError('image generation', 'Set OPENAI_API_KEY (docs/AI_PROVIDERS.md).');
  }
  return new OpenAiImageProvider(env.OPENAI_API_KEY);
}

let fakeYouTubeSingleton: FakeYouTubeClient | null = null;

export function getYouTubeClient(env: Env, auth: OAuth2Client | null): YouTubeClient {
  if (env.TEST_MODE) {
    if (!fakeYouTubeSingleton) fakeYouTubeSingleton = new FakeYouTubeClient();
    return fakeYouTubeSingleton;
  }
  if (!auth) {
    throw new MissingProviderError(
      'YouTube',
      'Connect the channel via Google OAuth in the dashboard (docs/GOOGLE_YOUTUBE_OAUTH.md).',
    );
  }
  return new RealYouTubeClient(auth);
}
