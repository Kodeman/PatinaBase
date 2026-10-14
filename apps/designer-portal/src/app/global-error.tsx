'use client';

import { useEffect } from 'react';
import { logError } from '@/lib/error-handler';

type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    logError(error, { boundary: 'global' });
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <main className="flex min-h-screen items-center justify-center px-6 py-12">
          <section className="max-w-lg text-center" role="alert">
            <p className="font-heading text-xl">The studio could not open this page.</p>
            <button className="mt-5 min-h-[44px] px-4 text-sm" onClick={reset} type="button">
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
