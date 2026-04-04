export default function ProjectsLoading() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header skeleton */}
      <div className="border-b border-[var(--border-default)]">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="h-6 w-32 animate-pulse rounded-[3px] bg-patina-pearl" />
            <div className="flex gap-4">
              <div className="h-6 w-24 animate-pulse rounded-[3px] bg-patina-pearl" />
              <div className="h-6 w-24 animate-pulse rounded-[3px] bg-patina-pearl" />
            </div>
          </div>
        </div>
      </div>

      {/* Main content skeleton */}
      <main className="mx-auto flex w-full max-w-6xl flex-col px-6 py-12">
        {/* Hero skeleton */}
        <section>
          <div className="h-4 w-32 animate-pulse rounded-[3px] bg-patina-pearl" />
          <div className="mt-4 h-10 w-full animate-pulse rounded-[3px] bg-patina-pearl" />
          <div className="mt-4 h-6 w-3/4 animate-pulse rounded-[3px] bg-patina-pearl" />
        </section>

        {/* Strata mark placeholder */}
        <div className="flex flex-col gap-1 py-8">
          <div className="h-[1.5px] w-[60px] bg-patina-pearl" />
          <div className="h-[1.5px] w-[48px] bg-patina-pearl opacity-50" />
          <div className="h-[1.5px] w-[36px] bg-patina-pearl opacity-25" />
        </div>

        {/* Project rows skeleton */}
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-start justify-between border-b border-[var(--border-default)] py-6"
          >
            <div className="flex-1 space-y-2">
              <div className="h-6 w-48 animate-pulse rounded-[3px] bg-patina-pearl" />
              <div className="h-3 w-32 animate-pulse rounded-[3px] bg-patina-pearl" />
              <div className="mt-2 h-[2px] w-full animate-pulse bg-patina-pearl" />
              <div className="h-4 w-64 animate-pulse rounded-[3px] bg-patina-pearl" />
            </div>
            <div className="text-right space-y-1">
              <div className="h-8 w-16 animate-pulse rounded-[3px] bg-patina-pearl" />
              <div className="h-3 w-20 animate-pulse rounded-[3px] bg-patina-pearl" />
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
