'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/controls';

export default function MoodBoardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="fixed inset-0 flex h-[100dvh] items-center justify-center overflow-hidden overscroll-contain bg-[var(--bg-primary)] p-8">
      <div className="max-w-md text-center">
        <h1 className="font-heading text-2xl text-[var(--text-primary)]">The board hit a snag</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {error.digest ?? error.message}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          {/* Server state is authoritative — a remount recovers everything flushed;
              at most ~1s of buffered geometry is lost. */}
          <Button variant="primary" onClick={() => reset()}>
            Reopen board
          </Button>
          <Button variant="secondary" onClick={() => router.push('/desk')}>
            Return to the Desk
          </Button>
        </div>
      </div>
    </main>
  );
}
