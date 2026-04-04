'use client';

import Link from 'next/link';
import { useValidationQueue, useSubmitValidation } from '@patina/supabase';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function ValidatePage() {
  const { data: rawQueue, isLoading } = useValidationQueue() as { data: Any; isLoading: boolean };
  const submitValidation = useSubmitValidation();
  const queue = Array.isArray(rawQueue) ? rawQueue : [];
  const current = queue[0];

  if (isLoading) return <LoadingStrata />;

  return (
    <div className="pt-8">
      <div className="type-meta mb-6">
        <Link href="/portal/teaching" className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]">Teaching</Link>
        <span className="mx-2">&rarr;</span><span>Validation</span>
      </div>

      <h1 className="type-section-head mb-6">Validation ({queue.length} remaining)</h1>

      {current ? (
        <div>
          <span className="type-item-name">{current.product?.name || current.name || 'Product'}</span>
          {current.proposed_styles && (
            <div className="mt-4">
              <span className="type-meta mb-2 block">Proposed Styles</span>
              <div className="flex flex-wrap gap-2">
                {current.proposed_styles.map((style: string) => (
                  <span key={style} className="type-btn-text rounded-sm border border-patina-pearl bg-patina-off-white px-3.5 py-1.5 text-patina-mocha">
                    {style}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-4">
            <PortalButton
              variant="primary"
              onClick={() => submitValidation.mutate({ productId: current.product_id || current.id, vote: 'agree' })}
              disabled={submitValidation.isPending}
            >
              Agree
            </PortalButton>
            <PortalButton
              variant="secondary"
              onClick={() => submitValidation.mutate({ productId: current.product_id || current.id, vote: 'disagree' })}
              disabled={submitValidation.isPending}
            >
              Disagree
            </PortalButton>
            <PortalButton variant="ghost" onClick={() => submitValidation.mutate({ productId: current.product_id || current.id, vote: 'skip' })}>
              Skip
            </PortalButton>
          </div>
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
          No products needing validation. Check back soon.
        </p>
      )}
    </div>
  );
}
