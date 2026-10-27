'use client';

import Link from 'next/link';
import { Round8DocumentLoading } from './round8-document-loading';

/** Before identity resolves, print no job name, contents or cached chapter. */
export function Round8DocumentState({ state, onRetry }: {
  state: 'loading' | 'error' | 'missing';
  onRetry?: () => void;
}) {
  if (state === 'loading') {
    return <Round8DocumentLoading />;
  }
  const failed = state === 'error';
  return (
    <main aria-labelledby="document-state-title" className="min-h-screen bg-[var(--paper)] px-[18px] py-12 text-[var(--ink)] min-[600px]:px-[4%]">
      <div className="mx-auto max-w-[720px] border-t border-[var(--hairline-strong)] pt-8">
        <div role={failed ? 'alert' : undefined}>
          <h1 id="document-state-title" className="font-heading text-[28px]">
            {failed ? 'This document could not be loaded.' : 'This document is not available.'}
          </h1>
          <p className="t-body-sm mt-4 max-w-[480px]">
            {failed
              ? 'The read failed. Try again.'
              : 'The link may have changed, or you may no longer have access. Ask the studio to check the link and your access.'}
          </p>
        </div>
        <nav aria-label="Document recovery" className="mt-6 flex flex-wrap items-center gap-6 t-body-sm">
          {failed && <button type="button" onClick={onRetry} className="min-h-[44px] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">Try again</button>}
          <Link href="/desk" className="inline-flex min-h-[44px] items-center underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">Back to Studio</Link>
        </nav>
      </div>
    </main>
  );
}
