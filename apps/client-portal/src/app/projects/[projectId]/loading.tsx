export default function ProjectDetailLoading() {
  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      {/* Header skeleton */}
      <div className="border-b border-[var(--color-border)] bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
            <div className="flex gap-4">
              <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        </div>
      </div>

      {/* Main content skeleton */}
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
        {/* Project overview skeleton */}
        <section className="space-y-4">
          <div className="h-10 w-64 animate-pulse rounded bg-gray-200" />
          <div className="h-6 w-full animate-pulse rounded bg-gray-200" />
          <div className="flex gap-4">
            <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
            <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
            <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
          </div>
        </section>

        {/* Timeline skeleton */}
        <section className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-3">
                  <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
                  <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
                </div>
                <div className="h-6 w-20 animate-pulse rounded-full bg-gray-200" />
              </div>
              <div className="mt-4 h-2 w-full animate-pulse rounded-full bg-gray-200" />
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
