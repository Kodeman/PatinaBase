'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useClaimNextProduct, useAssignStyle, useAllStyles, useSubmitTeaching } from '@patina/supabase';
import { PortalButton } from '@/components/portal/button';
import { StyleTag } from '@/components/portal/style-tag';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function QuickTagsPage() {
  const { data: product, isLoading: claiming } = useClaimNextProduct('quick') as { data: Any; isLoading: boolean };
  const { data: rawStyles } = useAllStyles() as { data: Any };
  const assignStyle = useAssignStyle();
  const submitTeaching = useSubmitTeaching();
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);

  const styles = Array.isArray(rawStyles) ? rawStyles : [];

  const toggleStyle = (styleId: string) => {
    setSelectedStyles((prev) =>
      prev.includes(styleId) ? prev.filter((s) => s !== styleId) : [...prev, styleId]
    );
  };

  const handleSubmit = () => {
    if (!product?.id || selectedStyles.length === 0) return;
    submitTeaching.mutate(
      { productId: product.product_id || product.id, styles: selectedStyles, mode: 'quick' },
      { onSuccess: () => setSelectedStyles([]) }
    );
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
            <PortalButton variant="primary" onClick={handleSubmit} disabled={selectedStyles.length === 0 || submitTeaching.isPending}>
              {submitTeaching.isPending ? 'Submitting...' : 'Submit Tags'}
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
