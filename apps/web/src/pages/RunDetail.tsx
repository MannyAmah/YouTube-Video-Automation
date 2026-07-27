import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { api, ArtifactRow, RunDetail } from '../api';
import { formatBytes, StateBadge } from '../badges';

export function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (id) api.run(id).then(setRun).catch(() => undefined);
  }, [id]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 8_000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (!run) return <p className="text-sm text-slate-400">Loading…</p>;

  const video = run.artifacts.find((a) => a.kind === 'video_mp4');
  const thumbnail = run.artifacts.find((a) => a.kind === 'thumbnail');
  const script = run.scripts[0];

  async function action(name: string, body?: unknown) {
    try {
      await api.runAction(run!.id, name, body);
      setMessage(null);
      refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  const buttons: { label: string; action: string; show: boolean; danger?: boolean }[] = [
    { label: 'Approve script', action: 'approve-script', show: run.state === 'SCRIPT_REVIEW' },
    { label: 'Request revision', action: 'reject-script', show: run.state === 'SCRIPT_REVIEW', danger: true },
    { label: 'Approve upload', action: 'approve-upload', show: run.state === 'AWAITING_APPROVAL' },
    { label: 'Publish now', action: 'publish', show: run.state === 'UPLOADED_PRIVATE' },
    { label: 'Retry', action: 'retry', show: run.state === 'FAILED' },
    {
      label: 'Cancel run',
      action: 'cancel',
      show: !['PUBLISHED', 'CANCELLED'].includes(run.state),
      danger: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-semibold capitalize">{run.brief.medicationQuery}</h1>
        <StateBadge state={run.state} />
        <span className="text-xs text-slate-400">{run.id}</span>
        <div className="flex-1" />
        {buttons
          .filter((b) => b.show)
          .map((b) => (
            <button
              key={b.action}
              onClick={() => action(b.action)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                b.danger
                  ? 'bg-white border border-red-300 text-red-700 hover:bg-red-50'
                  : 'bg-teal-700 text-white hover:bg-teal-800'
              }`}
            >
              {b.label}
            </button>
          ))}
      </div>
      {message && <p className="text-sm text-red-600">{message}</p>}
      {run.failureReason && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 whitespace-pre-wrap">
          {run.failureReason}
        </div>
      )}
      {run.publication && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm">
          <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Publication</h3>
          <div className="grid md:grid-cols-4 gap-2 text-xs text-slate-600">
            <div>Video ID: <b>{run.publication.youtubeVideoId ?? '—'}</b></div>
            <div>Privacy: <b>{run.publication.privacyStatus}</b></div>
            <div>Scheduled: {run.publication.scheduledFor ? new Date(run.publication.scheduledFor).toLocaleString() : '—'}</div>
            <div>Published: {run.publication.publishedAt ? new Date(run.publication.publishedAt).toLocaleString() : '—'}</div>
          </div>
          {run.publication.lastError && (
            <p className="text-xs text-red-600 mt-2">{run.publication.lastError}</p>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          {video && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Video preview</h3>
              <video controls className="w-full rounded-lg" src={fileUrl(run.id, video)} />
            </div>
          )}
          {thumbnail && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Thumbnail</h3>
              <img className="w-64 rounded-lg border border-slate-100" src={fileUrl(run.id, thumbnail)} />
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Artifacts</h3>
            <table className="w-full text-xs">
              <tbody>
                {run.artifacts.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2 font-medium">{a.kind}</td>
                    <td className="py-1.5 pr-2 text-slate-500">{formatBytes(a.bytes)}</td>
                    <td className="py-1.5 pr-2 text-slate-400">{a.producer}</td>
                    <td className="py-1.5 text-right">
                      <a className="text-teal-700 hover:underline" href={fileUrl(run.id, a)} target="_blank">
                        open
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          {script && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">
                Script v{script.version} {script.review && (script.review.ok ? '· passed review' : '· needs work')}
              </h3>
              <p className="font-medium text-sm mb-2">{script.content.title}</p>
              <p className="text-xs text-slate-600 italic mb-3">{script.content.hook}</p>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {script.content.sections.map((s) => (
                  <div key={s.id}>
                    <p className="text-xs font-semibold text-slate-700">{s.heading}</p>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap">{s.narration}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {s.claims.length} cited claim(s): {s.claims.flatMap((c) => c.sourceIds).join(', ')}
                    </p>
                  </div>
                ))}
                <p className="text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                  {script.content.disclaimer}
                </p>
              </div>
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Approvals</h3>
            <ul className="text-xs space-y-1">
              {run.approvals.map((a, i) => (
                <li key={i} className="text-slate-600">
                  <b>{a.stage}</b> {a.decision} by {a.actorType}
                  {a.notes ? ` — ${a.notes}` : ''}{' '}
                  <span className="text-slate-400">({new Date(a.createdAt).toLocaleString()})</span>
                </li>
              ))}
              {run.approvals.length === 0 && <li className="text-slate-400">None yet</li>}
            </ul>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Job events</h3>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-[11px]">
                <tbody>
                  {run.jobEvents.map((e, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-1 pr-2 font-medium">{e.step}</td>
                      <td className={`py-1 pr-2 ${e.status === 'failed' ? 'text-red-600' : 'text-slate-500'}`}>
                        {e.status} (#{e.attempt})
                      </td>
                      <td className="py-1 pr-2 text-slate-400">
                        {e.durationMs ? `${(e.durationMs / 1000).toFixed(1)}s` : ''}
                      </td>
                      <td className="py-1 text-slate-400">{new Date(e.createdAt).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function fileUrl(runId: string, artifact: ArtifactRow): string {
  return `/api/runs/${runId}/artifacts/${artifact.id}/file`;
}
