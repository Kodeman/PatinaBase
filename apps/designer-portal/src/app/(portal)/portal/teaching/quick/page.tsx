'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useClaimNextProduct, useAssignStyle, useAllStyles } from '@patina/supabase';
import { PortalButton } from '@/components/portal/button';
import { StyleTag } from '@/components/portal/style-tag';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function QuickTagsPage() {
  // useClaimNextProduct is a MUTATION (claiming is a write). Trigger it on mount
  // to claim the next quick-tags product; the claimed row is the mutation result.
  const claim = useClaimNextProduct('quick_tags');
  const { mutate: claimNext } = claim;
  useEffect(() => {
    claimNext();
  }, [claimNext]);
  const product = claim.data as Any;
  const claiming = claim.isPending;
  const { data: rawStyles } = useAllStyles() as { data: Any };
  const assignStyle = useAssignStyle();
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);

  const styles = Array.isArray(rawStyles) ? rawStyles : [];

  const toggleStyle = (styleId: string) => {
    setSelectedStyles((prev) =>
      prev.includes(styleId) ? prev.filter((s) => s !== styleId) : [...prev, styleId]
    );
  };

  const handleSubmit = () => {
    const productId = product?.product_id || product?.id;
    if (!productId || selectedStyles.length === 0) return;
    // Quick-tags assigns each selected style to the product (first = primary),
    // then claims the next product in the queue.
    Promise.all(
      selectedStyles.map((styleId, i) =>
        assignStyle.mutateAsync({ productId, styleId, isPrimary: i === 0 })
      )
    ).then(() => {
      setSelectedStyles([]);
      claimNext();
    });
  };

  if (claiming) return <LoadingStrata />;

  return (
    <div className="pt-8">
      <div className="type-meta mb-6">
        <Link href="/portal/teaching" className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]">Teaching</Link>
        <span className="mx-2">&rarr;</span><span>Quick Tags</span>
      </div>

      <h1 className="type-section-head mb-6">Quick Tags</h1>

      {product ? (
        <div>
          <div className="mb-6">
            <span className="type-item-name">{product.product?.name || product.name || 'Product'}</span>
            {product.product?.description && (
              <p className="type-body mt-2 max-w-[640px]">{product.product.description}</p>
            )}
          </div>

          <div className="mb-6">
            <span className="type-meta mb-3 block">Select Style Tags</span>
            <div className="flex flex-wrap gap-2">
              {styles.map((style: Any) => (
                <button
                  key={style.id}
                  onClick={() => toggleStyle(style.id)}
                  className={`type-btn-text cursor-pointer rounded-sm border px-3.5 py-1.5 transition-colors ${
                    selectedStyles.includes(style.id)
                      ? 'border-[var(--accent-primary)] bg-[var(--bg-hover)] text-[var(--text-primary)]'
                      : 'border-patina-pearl bg-patina-off-white text-patina-mocha hover:border-[var(--accent-primary)]'
                  }`}
                >
                  {style.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            <PortalButton variant="primary" onClick={handleSubmit} disabled={selectedStyles.length === 0 || assignStyle.isPending}>
              {assignStyle.isPending ? 'Submitting...' : 'Submit Tags'}
            </PortalButton>
            <PortalButton variant="ghost" onClick={() => setSelectedStyles([])}>
              Clear
            </PortalButton>
          </div>
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
          No products in queue. Check back soon.
        </p>
      )}
    </div>
  );
}
