import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, RunSummary, StatusResponse } from '../api';
import { Dot, StateBadge } from '../badges';

export function DashboardPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [medication, setMedication] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.status().then(setStatus).catch(() => undefined);
    api.runs().then(setRuns).catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function startRun(e: FormEvent) {
    e.preventDefault();
    if (!medication.trim()) return;
    try {
      const { runId } = await api.startRun(medication.trim());
      setMessage(`Production started (${runId.slice(0, 8)}…)`);
      setMedication('');
      refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      {status?.emergencyPause && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm font-medium">
          ⛔ Emergency pause is ON — no jobs are processing and nothing will publish.
        </div>
      )}
      {status?.testMode && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
          Test mode: offline fake providers are active; uploads can never reach a real channel.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatusCard title="Channel">
          {status?.channel ? (
            <div className="space-y-1">
              <div className="text-sm font-medium">{status.channel.title}</div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Dot ok={status.channel.connected} />
                {status.channel.connected ? 'YouTube connected' : 'Not connected'}
              </div>
              <div className="text-xs text-slate-500">
                Mode: <b>{status.publishMode}</b>
              </div>
            </div>
          ) : (
            '—'
          )}
        </StatusCard>
        <StatusCard title="Providers">
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2"><Dot ok={!!status?.providers.openaiText} /> Script AI</div>
            <div className="flex items-center gap-2"><Dot ok={!!status?.providers.tts} /> Narration</div>
            <div className="flex items-center gap-2"><Dot ok={!!status?.providers.openaiImage} /> Images</div>
            <div className="flex items-center gap-2"><Dot ok={!!status?.providers.youtube} /> YouTube</div>
          </div>
        </StatusCard>
        <StatusCard title="Queue">
          <div className="space-y-1 text-xs text-slate-600">
            {status ? (
              Object.entries(status.queue).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="font-mono">{v}</span>
                </div>
              ))
            ) : (
              '—'
            )}
          </div>
        </StatusCard>
        <StatusCard title="Start production">
          <form onSubmit={startRun} className="space-y-2">
            <input
              value={medication}
              onChange={(e) => setMedication(e.target.value)}
              placeholder="e.g. lisinopril"
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            />
            <button className="w-full bg-teal-700 hover:bg-teal-800 text-white rounded-md py-1.5 text-sm font-medium">
              Generate video
            </button>
            {message && <p className="text-[11px] text-slate-500">{message}</p>}
          </form>
        </StatusCard>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-2">Medication</th>
              <th className="px-4 py-2">State</th>
              <th className="px-4 py-2">YouTube</th>
              <th className="px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link to={`/runs/${run.id}`} className="text-teal-700 font-medium hover:underline">
                    {run.brief.medicationQuery}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <StateBadge state={run.state} />
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {run.publication?.youtubeVideoId
                    ? `${run.publication.youtubeVideoId} (${run.publication.privacyStatus})`
                    : '—'}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {new Date(run.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">
                  No production runs yet. Start one above, or wait for the daily scheduler.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">{title}</h3>
      {children}
    </div>
  );
}
