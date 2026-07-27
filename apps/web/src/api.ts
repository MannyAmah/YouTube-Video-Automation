/** Typed-ish API client. All requests carry the session cookie. */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  });
  if (res.status === 401) {
    if (!location.pathname.startsWith('/login')) location.assign('/login');
    throw new ApiError(401, 'Not signed in');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (body as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ ok: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ email: string }>('/api/auth/me'),
  status: () => request<StatusResponse>('/api/status'),
  runs: () => request<RunSummary[]>('/api/runs'),
  run: (id: string) => request<RunDetail>(`/api/runs/${id}`),
  startRun: (medication: string) =>
    request<{ runId: string }>('/api/runs', { method: 'POST', body: JSON.stringify({ medication }) }),
  runAction: (id: string, action: string, body?: unknown) =>
    request<{ ok: boolean }>(`/api/runs/${id}/${action}`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  setPause: (paused: boolean) =>
    request<{ ok: boolean }>('/api/settings/pause', {
      method: 'POST',
      body: JSON.stringify({ paused }),
    }),
  updateChannel: (id: string, data: Record<string, unknown>) =>
    request<unknown>(`/api/channels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  analytics: () => request<AnalyticsResponse>('/api/analytics'),
};

export interface StatusResponse {
  providers: {
    openaiText: boolean;
    openaiImage: boolean;
    tts: boolean;
    youtube: boolean;
    testMode: boolean;
  };
  publishMode: 'autonomous' | 'supervised';
  emergencyPause: boolean;
  channel: {
    id: string;
    title: string;
    youtubeChannelId: string | null;
    connected: boolean;
    paused: boolean;
    maxPublishesPerDay: number;
  } | null;
  queue: Record<string, number>;
  runStates: Record<string, number>;
  testMode: boolean;
}

export interface RunSummary {
  id: string;
  state: string;
  createdAt: string;
  failureReason: string | null;
  brief: { medicationQuery: string; angle: string };
  publication: { youtubeVideoId: string | null; privacyStatus: string; publishedAt: string | null } | null;
}

export interface ArtifactRow {
  id: string;
  kind: string;
  relativePath: string;
  mimeType: string;
  bytes: number;
  producer: string;
  createdAt: string;
}

export interface RunDetail extends Omit<RunSummary, 'brief' | 'publication'> {
  brief: { medicationQuery: string; angle: string; targetDurationSec: number };
  publication: {
    youtubeVideoId: string | null;
    privacyStatus: string;
    publishedAt: string | null;
    scheduledFor: string | null;
    lastError: string | null;
  } | null;
  approvals: { stage: string; decision: string; actorType: string; notes: string | null; createdAt: string }[];
  artifacts: ArtifactRow[];
  scripts: { version: number; content: ScriptContent; review: { ok: boolean; failures: string[] } | null }[];
  jobEvents: { step: string; status: string; attempt: number; detail: string | null; createdAt: string; durationMs: number | null }[];
  scriptRevisions: number;
}

export interface ScriptContent {
  title: string;
  hook: string;
  sections: {
    id: string;
    heading: string;
    narration: string;
    claims: { text: string; sourceIds: string[] }[];
    visualIdea: string;
  }[];
  outro: string;
  disclaimer: string;
}

export interface AnalyticsResponse {
  publications: {
    runId: string;
    medication: string;
    youtubeVideoId: string | null;
    privacyStatus: string;
    publishedAt: string | null;
  }[];
  snapshots: { youtubeVideoId: string | null; capturedAt: string; metrics: Record<string, number> }[];
}
