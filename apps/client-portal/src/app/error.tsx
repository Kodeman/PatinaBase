'use client';

import { useEffect } from 'react';
import Link from 'next/link';

interface RootErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: RootErrorProps) {
  useEffect(() => {
    console.error('Root page error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="type-section-head">Something went wrong loading this page</h1>
          <p className="type-body mx-auto">
            We&rsquo;re having trouble displaying this page. This might be a temporary issue.
          </p>
        </div>

        {error.digest && (
          <div className="border-l-2 border-patina-terracotta pl-4 text-left">
            <p className="type-meta">Error Reference</p>
            <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">{error.digest}</p>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="rounded-[3px] bg-patina-charcoal px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/projects"
            className="inline-flex items-center justify-center rounded-[3px] border border-[var(--border-default)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--text-primary)]"
          >
            Back to your projects
          </Link>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <details className="mt-6 border-t border-[var(--border-default)] pt-4 text-left">
            <summary className="cursor-pointer type-meta">
              Error details (development only)
            </summary>
            <pre className="mt-2 overflow-auto text-xs text-[var(--text-muted)]">
              {error.stack || error.message}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
