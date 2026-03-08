export default function ProjectsLoading() {
  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      {/* Header skeleton */}
      <div className="border-b border-[var(--color-border)] bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
            <div className="flex gap-4">
              <div className="h-8 w-24 animate-pulse rounded bg-gray-200" />
              <div className="h-8 w-24 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        </div>
      </div>

      {/* Main content skeleton */}
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-12">
        {/* Hero section skeleton */}
        <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-8 py-10 shadow-xl">
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
          <div className="mt-4 h-10 w-full animate-pulse rounded bg-gray-200" />
          <div className="mt-4 h-6 w-3/4 animate-pulse rounded bg-gray-200" />
        </section>

        {/* Projects grid skeleton */}
        <section className="grid gap-6 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex h-full flex-col gap-4 rounded-3xl border border-[var(--color-border)] bg-white/80 p-6 shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 space-y-2">
                  <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
                  <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
                </div>
                <div className="h-6 w-16 animate-pulse rounded bg-gray-200" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-6 w-24 animate-pulse rounded bg-gray-200" />
                <div className="h-2 flex-1 animate-pulse rounded-full bg-gray-200" />
              </div>
              <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
              <div className="mt-auto flex items-center justify-between">
                <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
