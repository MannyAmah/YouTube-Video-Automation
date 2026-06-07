// Env loading + validation. Fail fast and loud — never run with half a config.
// No secrets in code (Iron Law #4); these come from the environment only.

import { z } from 'zod';

const Env = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  CLAUDE_MODEL_REASONING: z.string().default('claude-opus-4-8'),
  CLAUDE_MODEL_FAST: z.string().default('claude-sonnet-4-6'),
  MONTHLY_BUDGET_USD: z.coerce.number().positive().default(2000),
  MAX_CONCURRENT_RENDERS: z.coerce.number().int().positive().default(2),
  // Optional at this phase — stages that need them validate on use.
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_REFRESH_TOKEN: z.string().optional(),
  YOUTUBE_REDIRECT_URI: z.string().url().default('http://localhost:3456/auth/callback'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ALLOWED_USER_ID: z.string().optional(),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(): Config {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
