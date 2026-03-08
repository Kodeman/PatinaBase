export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)]">
      <div className="space-y-4 text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[var(--color-border)] border-t-[var(--color-accent)]" />
        <p className="text-lg text-[var(--color-muted)]">Loading...</p>
      </div>
    </div>
  );
}
