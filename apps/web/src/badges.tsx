const STATE_COLORS: Record<string, string> = {
  PUBLISHED: 'bg-green-100 text-green-800',
  SCHEDULED: 'bg-emerald-100 text-emerald-800',
  UPLOADED_PRIVATE: 'bg-sky-100 text-sky-800',
  FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-600',
  AWAITING_APPROVAL: 'bg-amber-100 text-amber-800',
  SCRIPT_REVIEW: 'bg-amber-100 text-amber-800',
};

export function StateBadge({ state }: { state: string }) {
  const color = STATE_COLORS[state] ?? 'bg-indigo-100 text-indigo-800';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${color}`}>
      {state.replace(/_/g, ' ')}
    </span>
  );
}

export function Dot({ ok }: { ok: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-slate-300'}`} />;
}

export function formatBytes(bytes: number): string {
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes > 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}
