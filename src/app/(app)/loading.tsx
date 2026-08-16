"use client";

export default function AppLoading() {
  return (
    <div className="flex h-full animate-pulse">
      {/* Sidebar skeleton */}
      <div className="hidden h-full w-14 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-12 items-center justify-center">
          <div className="h-5 w-5 rounded bg-muted" />
        </div>
        <div className="flex-1 space-y-2 px-2 py-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex h-8 items-center justify-center">
              <div className="h-4 w-4 rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="border-t border-border p-2">
          <div className="flex h-8 items-center justify-center">
            <div className="h-6 w-6 rounded-full bg-muted" />
          </div>
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 flex flex-col">
        {/* Topbar skeleton */}
        <div className="flex h-12 items-center border-b border-border px-4">
          <div className="h-5 w-32 rounded bg-muted" />
          <div className="ml-auto flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-muted" />
            <div className="h-7 w-7 rounded bg-muted" />
            <div className="h-7 w-48 rounded bg-muted" />
          </div>
        </div>

        {/* Content skeleton */}
        <div className="flex-1 p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-muted" />
            <div className="h-6 w-48 rounded bg-muted" />
            <div className="h-5 w-16 rounded-full bg-muted" />
          </div>

          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-8 w-16 rounded bg-muted" />
                <div className="h-3 w-32 rounded bg-muted" />
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="h-5 w-32 rounded bg-muted" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 w-4 rounded bg-muted" />
                <div className="h-4 flex-1 rounded bg-muted" />
                <div className="h-4 w-20 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
