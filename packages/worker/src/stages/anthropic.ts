// Claude client + a JSON-structured-output helper for the reasoning stages
// (script, fact-check, storyboard, metadata). Uses the Anthropic SDK; the key
// comes from env (Iron Law #4). No PHI flows here (§1).

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { Config } from '../config.js';

export function anthropic(cfg: Config): Anthropic {
  return new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY });
}

/** Ask Claude for JSON matching `schema`; retries once on parse/validation failure. */
export async function askJson<T>(
  cfg: Config,
  opts: { model: string; system: string; user: string; schema: z.ZodType<T>; maxTokens?: number },
): Promise<T> {
  const client = anthropic(cfg);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await client.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      system: `${opts.system}\nRespond with ONLY valid JSON. No prose, no markdown fences.`,
      messages: [{ role: 'user', content: opts.user }],
    });
    const text = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
    try {
      return opts.schema.parse(JSON.parse(stripFences(text)));
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`askJson: model did not return schema-valid JSON: ${String(lastErr)}`);
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
}
