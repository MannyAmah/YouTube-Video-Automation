import { ProviderError, StructuredRequest, TextProvider, TokenUsage } from './types';

const API = 'https://api.openai.com/v1/chat/completions';
const MAX_REPAIR_ATTEMPTS = 2;

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/**
 * OpenAI structured-output text provider. Requests JSON mode, validates with
 * Zod, and on validation failure feeds the errors back for bounded repair.
 */
export class OpenAiTextProvider implements TextProvider {
  readonly name = 'openai-text';

  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.OPENAI_TEXT_MODEL ?? 'gpt-4o',
    private readonly timeoutMs = 180_000,
  ) {
    if (!apiKey) throw new ProviderError(this.name, 'OPENAI_API_KEY is empty', false);
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: TokenUsage }> {
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      {
        role: 'system',
        content: `${req.system}\n\nRespond with a single JSON object only. Expected shape:\n${req.schemaDescription}`,
      },
      { role: 'user', content: req.user },
    ];

    for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
      const raw = await this.chat(messages, req);
      usage.inputTokens += raw.usage?.prompt_tokens ?? 0;
      usage.outputTokens += raw.usage?.completion_tokens ?? 0;
      const content = raw.choices?.[0]?.message?.content;
      if (!content) throw new ProviderError(this.name, 'Empty completion from OpenAI');

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        messages.push({ role: 'assistant', content });
        messages.push({
          role: 'user',
          content: 'That was not valid JSON. Respond again with ONLY the JSON object.',
        });
        continue;
      }

      const result = req.schema.safeParse(parsed);
      if (result.success) return { data: result.data, usage };

      const issues = result.error.issues
        .slice(0, 20)
        .map((i) => `- ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      messages.push({ role: 'assistant', content });
      messages.push({
        role: 'user',
        content: `The JSON failed schema validation:\n${issues}\nFix these issues and respond with the corrected complete JSON object only.`,
      });
    }
    throw new ProviderError(
      this.name,
      `Structured output failed schema validation after ${MAX_REPAIR_ATTEMPTS + 1} attempts`,
    );
  }

  private async chat(
    messages: { role: string; content: string }[],
    req: StructuredRequest<unknown>,
  ): Promise<ChatResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(API, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          response_format: { type: 'json_object' },
          max_tokens: req.maxOutputTokens ?? 8000,
          temperature: req.temperature ?? 0.7,
        }),
      });
      const body = (await res.json()) as ChatResponse;
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        throw new ProviderError(
          this.name,
          `OpenAI chat error ${res.status}: ${body.error?.message ?? 'unknown'}`,
          retryable,
        );
      }
      return body;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(this.name, `Request failed: ${(err as Error).message}`, true, err);
    } finally {
      clearTimeout(timer);
    }
  }
}
