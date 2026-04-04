'use client';

import Link from 'next/link';
import { useClaimNextProduct, useProductSpectrum, useSaveSpectrum } from '@patina/supabase';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function DeepAnalysisPage() {
  const { data: product, isLoading } = useClaimNextProduct('deep') as { data: Any; isLoading: boolean };
  const productId = product?.product_id || product?.id;
  const { data: spectrum } = useProductSpectrum(productId) as { data: Any };
  const saveSpectrum = useSaveSpectrum();

  if (isLoading) return <LoadingStrata />;

  return (
    <div className="pt-8">
      <div className="type-meta mb-6">
        <Link href="/portal/teaching" className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]">Teaching</Link>
        <span className="mx-2">&rarr;</span><span>Deep Analysis</span>
      </div>

      <h1 className="type-section-head mb-6">Deep Analysis</h1>

      {product ? (
        <div>
          <span className="type-item-name">{product.product?.name || product.name || 'Product'}</span>
          {product.product?.description && (
            <p className="type-body mt-2 mb-6 max-w-[640px]">{product.product.description}</p>
          )}

          <p className="type-body italic text-[var(--text-muted)]">
            Spectrum sliders will render here for detailed style analysis.
          </p>

          <div className="mt-6">
            <PortalButton variant="primary" disabled={saveSpectrum.isPending}>
              {saveSpectrum.isPending ? 'Saving...' : 'Save Analysis'}
            </PortalButton>
          </div>
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
          No products in queue for deep analysis. Check back soon.
        </p>
      )}
    </div>
  );
}
