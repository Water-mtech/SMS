export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-200" />
      <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
      <div className="h-64 animate-pulse rounded-xl bg-slate-200" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
