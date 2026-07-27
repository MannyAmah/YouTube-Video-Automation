import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * API integration tests. They exercise the BUILT application (dist/) so
 * NestJS decorator metadata behaves exactly as in production, against the
 * real local Postgres + Redis.
 *
 * Run `pnpm --filter @yva/api build` first (the test fails fast if dist is
 * stale/missing).
 */

let baseUrl: string;
let app: { close(): Promise<void> } | null = null;
let cookie = '';

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createApp } = require('../dist/bootstrap.js') as {
    createApp(): Promise<{
      listen(port: number): Promise<void>;
      getHttpServer(): { address(): { port: number } };
      close(): Promise<void>;
    }>;
  };
  const built = await createApp();
  await built.listen(0);
  const address = built.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  app = built;
}, 60_000);

afterAll(async () => {
  await app?.close();
});

describe('health', () => {
  it('healthz reports database and redis', async () => {
    const res = await fetch(`${baseUrl}/api/healthz`);
    const body = (await res.json()) as { ok: boolean; checks: Record<string, boolean> };
    expect(res.status).toBe(200);
    expect(body.checks.database).toBe(true);
    expect(body.checks.redis).toBe(true);
  });
});

describe('authentication', () => {
  it('rejects unauthenticated access to every protected route', async () => {
    for (const [method, path] of [
      ['GET', '/api/runs'],
      ['GET', '/api/status'],
      ['GET', '/api/analytics'],
      ['POST', '/api/runs'],
      ['POST', '/api/settings/pause'],
      ['POST', '/api/runs/some-id/publish'],
      ['GET', '/api/oauth/google/start'],
    ] as const) {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'POST' ? '{}' : undefined,
      });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it('rejects a wrong password', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: 'wrong-password-xx' }),
    });
    expect(res.status).toBe(401);
  });

  it('logs in with the seeded admin and reaches protected routes', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      }),
    });
    expect(res.status).toBe(200);
    cookie = res.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(cookie).toContain('yva_session=');

    const statusRes = await fetch(`${baseUrl}/api/status`, { headers: { cookie } });
    expect(statusRes.status).toBe(200);
    const status = (await statusRes.json()) as { publishMode: string };
    expect(['autonomous', 'supervised']).toContain(status.publishMode);
  });

  it('session cookie is HttpOnly and SameSite=Strict', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      }),
    });
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
  });
});

describe('run actions', () => {
  it('rejects invalid state actions with 400, not silent success', async () => {
    const runsRes = await fetch(`${baseUrl}/api/runs`, { headers: { cookie } });
    const runs = (await runsRes.json()) as { id: string; state: string }[];
    const published = runs.find((r) => r.state === 'PUBLISHED');
    if (published) {
      const res = await fetch(`${baseUrl}/api/runs/${published.id}/publish`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(400);
    }
  });
});
