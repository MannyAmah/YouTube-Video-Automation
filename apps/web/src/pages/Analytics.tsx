import { useEffect, useState } from 'react';
import { api, AnalyticsResponse } from '../api';

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);

  useEffect(() => {
    api.analytics().then(setData).catch(() => undefined);
  }, []);

  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;

  const latestByVideo = new Map<string, Record<string, number>>();
  for (const snap of data.snapshots) {
    if (snap.youtubeVideoId && !latestByVideo.has(snap.youtubeVideoId)) {
      latestByVideo.set(snap.youtubeVideoId, snap.metrics);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        All metrics come directly from the YouTube API. Nothing here is estimated or simulated —
        if a video has no snapshot yet, its cells are empty.
      </p>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-2">Medication</th>
              <th className="px-4 py-2">Video</th>
              <th className="px-4 py-2">Privacy</th>
              <th className="px-4 py-2">Published</th>
              <th className="px-4 py-2 text-right">Views</th>
              <th className="px-4 py-2 text-right">Likes</th>
              <th className="px-4 py-2 text-right">Comments</th>
            </tr>
          </thead>
          <tbody>
            {data.publications.map((p) => {
              const metrics = p.youtubeVideoId ? latestByVideo.get(p.youtubeVideoId) : undefined;
              return (
                <tr key={p.runId} className="border-t border-slate-100">
                  <td className="px-4 py-2 capitalize">{p.medication}</td>
                  <td className="px-4 py-2 text-xs font-mono text-slate-500">{p.youtubeVideoId}</td>
                  <td className="px-4 py-2 text-xs">{p.privacyStatus}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{metrics?.viewCount ?? ''}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{metrics?.likeCount ?? ''}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{metrics?.commentCount ?? ''}</td>
                </tr>
              );
            })}
            {data.publications.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">
                  No uploads yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
