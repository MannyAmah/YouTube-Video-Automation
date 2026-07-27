import { z } from 'zod';

/**
 * Environment contract. Each service calls `loadEnv('api' | 'worker')` once
 * at boot; an invalid configuration is a fatal error with a readable report.
 *
 * "Setup-safe" behaviour: DATABASE_URL, REDIS_URL and the security keys are
 * always required — the system cannot run without them. Provider keys
 * (OpenAI, ElevenLabs, Google) are optional at boot; the pipeline checks for
 * them per step and fails that step with a clear error if missing, and the
 * dashboard surfaces which providers are configured.
 */

const base = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  APP_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'APP_ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(10, 'ADMIN_PASSWORD must be at least 10 characters'),
  MEDIA_ROOT: z.string().min(1).default('./media-store'),
  /**
   * Two-service topologies (Railway): the media volume is mounted on the
   * worker only. When set on the API, artifact requests whose file is not
   * on local disk are proxied to the worker's internal file endpoint,
   * authenticated with an HMAC of SESSION_SECRET.
   */
  WORKER_INTERNAL_URL: z.string().optional().default(''),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  OPENAI_API_KEY: z.string().optional().default(''),
  ELEVENLABS_API_KEY: z.string().optional().default(''),
  ELEVENLABS_VOICE_ID: z.string().optional().default(''),
  PUBLISH_MODE: z.enum(['autonomous', 'supervised']).default('autonomous'),
  EMERGENCY_PAUSE: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
  MAX_PUBLISHES_PER_DAY: z.coerce.number().int().min(0).max(24).default(1),
  TEST_MODE: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
  // Programmatic animation engine (Python/Manim). Paths resolved at boot;
  // defaults suit the Docker image and the local monorepo layout.
  ANIMATOR_PYTHON: z.string().optional().default(''),
  ANIMATOR_DIR: z.string().optional().default(''),
});

export type Env = z.infer<typeof base>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = base.safeParse(source);
  if (!parsed.success) {
    const report = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${report}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper — clears the memoized env. */
export function resetEnvCache(): void {
  cached = null;
}

export interface ProviderStatus {
  openaiText: boolean;
  openaiImage: boolean;
  tts: boolean;
  youtube: boolean;
  testMode: boolean;
}

export function providerStatus(env: Env): ProviderStatus {
  return {
    openaiText: env.TEST_MODE || env.OPENAI_API_KEY.length > 0,
    openaiImage: env.TEST_MODE || env.OPENAI_API_KEY.length > 0,
    tts: env.TEST_MODE || env.ELEVENLABS_API_KEY.length > 0 || env.OPENAI_API_KEY.length > 0,
    youtube:
      env.TEST_MODE || (env.GOOGLE_CLIENT_ID.length > 0 && env.GOOGLE_CLIENT_SECRET.length > 0),
    testMode: env.TEST_MODE,
  };
}
