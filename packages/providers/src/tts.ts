import { writeFile } from 'fs/promises';
import { ProviderError, TtsProvider, TtsResult } from './types';

/**
 * ElevenLabs TTS — primary narration voice. Chosen for the most natural,
 * warm, non-synthetic delivery, per the channel's voice requirement.
 */
export class ElevenLabsTtsProvider implements TtsProvider {
  readonly name = 'elevenlabs-tts';

  constructor(
    private readonly apiKey: string,
    // "Rachel" — calm, warm, widely used narration premade voice.
    private readonly voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
    private readonly modelId = process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2',
    private readonly timeoutMs = 300_000,
  ) {
    if (!apiKey) throw new ProviderError(this.name, 'ELEVENLABS_API_KEY is empty', false);
  }

  async synthesize(text: string, outPath: string): Promise<TtsResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { 'xi-api-key': this.apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({
            text,
            model_id: this.modelId,
            voice_settings: {
              stability: 0.55,
              similarity_boost: 0.75,
              style: 0.25,
              use_speaker_boost: true,
            },
          }),
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new ProviderError(
          this.name,
          `TTS error ${res.status}: ${detail.slice(0, 300)}`,
          res.status === 429 || res.status >= 500,
        );
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 5_000) {
        throw new ProviderError(this.name, `Audio suspiciously small (${buffer.length} bytes)`);
      }
      await writeFile(outPath, buffer);
      return {
        bytes: buffer.length,
        mimeType: 'audio/mpeg',
        voice: this.voiceId,
        provider: this.name,
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(this.name, `Request failed: ${(err as Error).message}`, true, err);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** OpenAI TTS — fallback narration provider. */
export class OpenAiTtsProvider implements TtsProvider {
  readonly name = 'openai-tts';

  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts',
    private readonly voice = process.env.OPENAI_TTS_VOICE ?? 'nova',
    private readonly timeoutMs = 300_000,
  ) {
    if (!apiKey) throw new ProviderError(this.name, 'OPENAI_API_KEY is empty', false);
  }

  async synthesize(text: string, outPath: string): Promise<TtsResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          voice: this.voice,
          input: text,
          response_format: 'mp3',
          instructions:
            'Warm, calm, empathetic health educator. Conversational pace, natural pauses, never robotic or salesy.',
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new ProviderError(
          this.name,
          `TTS error ${res.status}: ${detail.slice(0, 300)}`,
          res.status === 429 || res.status >= 500,
        );
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 5_000) {
        throw new ProviderError(this.name, `Audio suspiciously small (${buffer.length} bytes)`);
      }
      await writeFile(outPath, buffer);
      return { bytes: buffer.length, mimeType: 'audio/mpeg', voice: this.voice, provider: this.name };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(this.name, `Request failed: ${(err as Error).message}`, true, err);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Tries the primary provider, falls back to the secondary on failure. */
export class FallbackTtsProvider implements TtsProvider {
  readonly name: string;
  constructor(
    private readonly primary: TtsProvider,
    private readonly secondary: TtsProvider,
  ) {
    this.name = `${primary.name}+${secondary.name}`;
  }

  async synthesize(text: string, outPath: string): Promise<TtsResult> {
    try {
      return await this.primary.synthesize(text, outPath);
    } catch {
      return this.secondary.synthesize(text, outPath);
    }
  }
}
