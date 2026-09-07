// The route skeleton matches the drawn layout because the hierarchy is known
// before the data arrives. It shows no counts and no names — a skeleton with
// "5 of 5" in it would be a leak.
export function ExchangeSkeleton() {
  return (
    <div
      className="animate-pulse space-y-4"
      aria-busy="true"
      aria-label="Loading exchange"
    >
      <div className="h-6 w-2/3 rounded bg-muted" />
      <div className="h-4 w-1/3 rounded bg-muted" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border p-4">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-muted" />
            <div className="space-y-2">
              <div className="h-5 w-40 rounded bg-muted" />
              <div className="h-3 w-28 rounded bg-muted" />
            </div>
          </div>
          <div className="h-10 w-48 rounded-full bg-muted" />
        </div>
        <div className="space-y-3 rounded-xl border p-4">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="flex gap-3">
            <div className="h-7 w-7 rounded-full bg-muted" />
            <div className="h-7 w-7 rounded-full bg-muted" />
            <div className="h-7 w-7 rounded-full bg-muted" />
          </div>
          <div className="h-3 w-full rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
