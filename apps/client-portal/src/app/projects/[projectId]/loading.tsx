export default function ProjectDetailLoading() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header skeleton */}
      <div className="border-b border-[var(--border-default)]">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="h-6 w-48 animate-pulse rounded-[3px] bg-patina-pearl" />
            <div className="flex gap-4">
              <div className="h-6 w-32 animate-pulse rounded-[3px] bg-patina-pearl" />
            </div>
          </div>
        </div>
      </div>

      {/* Main content skeleton */}
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
        {/* Project overview skeleton */}
        <section className="space-y-4">
          <div className="h-3 w-32 animate-pulse rounded-[3px] bg-patina-pearl" />
          <div className="h-10 w-64 animate-pulse rounded-[3px] bg-patina-pearl" />
          <div className="h-5 w-full animate-pulse rounded-[3px] bg-patina-pearl" />
          <div className="flex gap-4">
            <div className="h-3 w-32 animate-pulse rounded-[3px] bg-patina-pearl" />
            <div className="h-3 w-32 animate-pulse rounded-[3px] bg-patina-pearl" />
          </div>
        </section>

        {/* Strata mark placeholder */}
        <div className="flex flex-col gap-1 py-8">
          <div className="h-[1.5px] w-[60px] bg-patina-pearl" />
          <div className="h-[1.5px] w-[48px] bg-patina-pearl opacity-50" />
          <div className="h-[1.5px] w-[36px] bg-patina-pearl opacity-25" />
        </div>

        {/* Timeline skeleton */}
        <section className="space-y-0">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="border-b border-[var(--border-default)] py-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-3">
                  <div className="h-3 w-24 animate-pulse rounded-[3px] bg-patina-pearl" />
                  <div className="h-6 w-56 animate-pulse rounded-[3px] bg-patina-pearl" />
                  <div className="h-4 w-full animate-pulse rounded-[3px] bg-patina-pearl" />
                </div>
                <div className="text-right space-y-1">
                  <div className="h-8 w-12 animate-pulse rounded-[3px] bg-patina-pearl" />
                  <div className="h-3 w-8 animate-pulse rounded-[3px] bg-patina-pearl" />
                </div>
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
