import { useCallback, useEffect, useState } from 'react';
import { api, StatusResponse } from '../api';
import { Dot } from '../badges';

export function SettingsPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.status().then(setStatus).catch(() => undefined);
  }, []);
  useEffect(refresh, [refresh]);

  async function togglePause() {
    if (!status) return;
    const next = !status.emergencyPause;
    if (
      next ||
      confirm('Resume processing? Autonomous publishing will continue where it left off.')
    ) {
      await api.setPause(next).catch((e) => setMessage(e.message));
      refresh();
    }
  }

  async function setMode(mode: 'autonomous' | 'supervised') {
    if (!status?.channel) return;
    await api.updateChannel(status.channel.id, { publishMode: mode }).catch((e) => setMessage(e.message));
    refresh();
  }

  async function setQuota(value: number) {
    if (!status?.channel) return;
    await api
      .updateChannel(status.channel.id, { maxPublishesPerDay: value })
      .catch((e) => setMessage(e.message));
    refresh();
  }

  if (!status) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      {message && <p className="text-sm text-red-600">{message}</p>}

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-1">Emergency pause</h2>
        <p className="text-xs text-slate-500 mb-3">
          Stops all pipeline processing and publishing immediately. Runs resume from where they
          stopped when unpaused.
        </p>
        <button
          onClick={togglePause}
          className={`px-4 py-2 rounded-md text-sm font-semibold ${
            status.emergencyPause
              ? 'bg-green-700 text-white hover:bg-green-800'
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {status.emergencyPause ? 'Resume system' : 'Pause everything'}
        </button>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-1">Publish mode</h2>
        <p className="text-xs text-slate-500 mb-3">
          <b>Autonomous</b>: videos that pass every automated quality and citation check are
          uploaded private, then published automatically within the daily quota. <b>Supervised</b>:
          the pipeline pauses for your approval at script and upload stages.
        </p>
        <div className="flex gap-2">
          {(['autonomous', 'supervised'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setMode(mode)}
              className={`px-4 py-2 rounded-md text-sm font-medium border ${
                status.publishMode === mode
                  ? 'bg-teal-700 text-white border-teal-700'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <label className="text-xs font-medium text-slate-600 mr-2">Max publishes per day</label>
          <select
            value={status.channel?.maxPublishesPerDay ?? 1}
            onChange={(e) => setQuota(Number(e.target.value))}
            className="border border-slate-300 rounded-md px-2 py-1 text-sm"
          >
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-1">YouTube connection</h2>
        {status.channel?.connected ? (
          <p className="text-xs text-slate-600 flex items-center gap-2">
            <Dot ok /> Connected to channel <b>{status.channel.title}</b> (
            {status.channel.youtubeChannelId})
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-3">
              Connect the Google account that owns your YouTube channel. Requires
              GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET to be configured (see
              docs/GOOGLE_YOUTUBE_OAUTH.md).
            </p>
            <a
              href={`/api/oauth/google/start?channelId=${status.channel?.id ?? ''}`}
              className="inline-block bg-teal-700 hover:bg-teal-800 text-white rounded-md px-4 py-2 text-sm font-medium"
            >
              Connect YouTube
            </a>
          </>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-2">Provider status</h2>
        <ul className="text-xs space-y-1.5 text-slate-600">
          <li className="flex items-center gap-2">
            <Dot ok={status.providers.openaiText} /> Script generation (OPENAI_API_KEY)
          </li>
          <li className="flex items-center gap-2">
            <Dot ok={status.providers.tts} /> Narration (ELEVENLABS_API_KEY or OPENAI_API_KEY)
          </li>
          <li className="flex items-center gap-2">
            <Dot ok={status.providers.openaiImage} /> Illustrations (OPENAI_API_KEY)
          </li>
          <li className="flex items-center gap-2">
            <Dot ok={status.providers.youtube} /> YouTube upload (Google OAuth)
          </li>
        </ul>
        {status.testMode && (
          <p className="text-[11px] text-amber-700 mt-3">
            TEST_MODE is on: all of the above are satisfied by offline fakes.
          </p>
        )}
      </section>
    </div>
  );
}
