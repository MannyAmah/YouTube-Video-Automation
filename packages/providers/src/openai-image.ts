import { writeFile } from 'fs/promises';
import { ImageProvider, ImageResult, ProviderError } from './types';

const API = 'https://api.openai.com/v1/images/generations';

interface ImageResponse {
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string };
}

/** OpenAI image generation (gpt-image-1 by default; landscape 16:9-ish). */
export class OpenAiImageProvider implements ImageProvider {
  readonly name = 'openai-image';

  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1',
    private readonly timeoutMs = 240_000,
  ) {
    if (!apiKey) throw new ProviderError(this.name, 'OPENAI_API_KEY is empty', false);
  }

  async generate(prompt: string, outPath: string): Promise<ImageResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const size = this.model.startsWith('dall-e') ? '1792x1024' : '1536x1024';
      const body: Record<string, unknown> = {
        model: this.model,
        prompt,
        n: 1,
        size,
      };
      if (this.model.startsWith('dall-e')) body.response_format = 'b64_json';
      const res = await fetch(API, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as ImageResponse;
      if (!res.ok) {
        throw new ProviderError(
          this.name,
          `Image error ${res.status}: ${json.error?.message ?? 'unknown'}`,
          res.status === 429 || res.status >= 500,
        );
      }
      const first = json.data?.[0];
      let buffer: Buffer;
      if (first?.b64_json) {
        buffer = Buffer.from(first.b64_json, 'base64');
      } else if (first?.url) {
        const imgRes = await fetch(first.url);
        if (!imgRes.ok) throw new ProviderError(this.name, `Image download failed ${imgRes.status}`);
        buffer = Buffer.from(await imgRes.arrayBuffer());
      } else {
        throw new ProviderError(this.name, 'Image response contained no image data');
      }
      if (buffer.length < 10_000) {
        throw new ProviderError(this.name, `Image suspiciously small (${buffer.length} bytes)`);
      }
      await writeFile(outPath, buffer);
      return { bytes: buffer.length, mimeType: 'image/png', provider: this.name };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(this.name, `Request failed: ${(err as Error).message}`, true, err);
    } finally {
      clearTimeout(timer);
    }
  }
}
