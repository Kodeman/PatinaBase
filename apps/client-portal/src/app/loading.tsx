export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]">
      <div className="space-y-4 text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[var(--border-default)] border-t-[var(--accent-primary)]" />
        <p className="type-meta">Loading...</p>
      </div>
    </div>
  );
}
