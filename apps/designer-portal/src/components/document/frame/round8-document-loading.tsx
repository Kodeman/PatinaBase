import { DocumentSkeleton } from '@/components/loading';

/** Available before the round-8 recovery chunk, with the same read announcement. */
export function Round8DocumentLoading() {
  return (
    <>
      <p role="status" className="sr-only">Picking up the document…</p>
      <main aria-label="Loading document" aria-busy="true" className="min-h-screen bg-[var(--paper)]">
        <DocumentSkeleton />
      </main>
    </>
  );
}
