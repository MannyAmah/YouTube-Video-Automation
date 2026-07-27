/** Minimal HTTP JSON client with timeout and bounded retry for public APIs. */

export class HttpError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson<T = unknown>(
  url: string,
  { timeoutMs = 15_000, retries = 2, headers = {} }: FetchJsonOptions = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json', 'user-agent': 'MedExplained/2.0', ...headers },
      });
      if (res.status === 404) throw new HttpError(url, 404, `Not found: ${url}`);
      if (res.status === 429 || res.status >= 500) {
        throw new HttpError(url, res.status);
      }
      if (!res.ok) throw new HttpError(url, res.status);
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      // 404s are definitive — do not retry.
      if (err instanceof HttpError && err.status === 404) throw err;
      if (attempt < retries) await sleep(500 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
