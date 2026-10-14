'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { logError } from '@/lib/error-handler';

type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DocumentError({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    logError(error, { boundary: 'document' });
  }, [error]);

  return (
    <main className="flex min-h-[50vh] items-center justify-center bg-[var(--bg-primary)] px-6 py-12">
      <section className="max-w-lg text-center" role="alert">
        <p className="font-heading text-xl text-[var(--text-primary)]">
          This part of the paper could not be read.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button className="min-h-[44px] px-4 text-sm" onClick={reset} type="button">
            Try again
          </button>
          <Link className="inline-flex min-h-[44px] items-center px-4 text-sm" href="/desk">
            Back to the Desk
          </Link>
        </div>
      </section>
    </main>
  );
}
