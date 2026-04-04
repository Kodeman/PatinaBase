'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useProduct } from '@/hooks/use-products';
import { Breadcrumb, LoadingStrata } from '@/components/portal';
import {
  ProductEditProvider,
  useProductEdit,
  EditModeBar,
  HeroGallery,
  ProductIdentity,
  ProductStory,
  MaterialCloseups,
  Specifications,
  MakerStory,
  PairsWith,
  DesignerIntelligence,
} from '@/components/product-detail';

// ── Keyboard Shortcuts ─────────────────────────────────────────────────

function KeyboardShortcuts() {
  const { toggleMode, publishChanges, mode } = useProductEdit();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        toggleMode();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && mode === 'edit') {
        e.preventDefault();
        publishChanges();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleMode, publishChanges, mode]);

  return null;
}

// ── Page Content (inside provider) ─────────────────────────────────────

function ProductDetailContent() {
  const { mode, draft, toggleMode } = useProductEdit();

  return (
    <>
      <KeyboardShortcuts />
      <EditModeBar />

      <div className="px-[clamp(1.5rem,5vw,2.5rem)] pt-6">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: 'Products', href: '/portal/catalog' },
            { label: draft.name || 'Product' },
          ]}
        />

        {/* Edit toggle (present mode) */}
        {mode === 'present' && (
          <div className="mb-4 flex justify-end">
            <button
              onClick={toggleMode}
              className="cursor-pointer rounded-sm border border-[var(--border-subtle)] bg-transparent px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-muted)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
            >
              ✎ Edit Mode
            </button>
          </div>
        )}

        {/* Zone 1: Hero Gallery */}
        <HeroGallery />

        {/* Zone 2: Product Identity */}
        <ProductIdentity />

        {/* Zone 3: Product Story */}
        <ProductStory />

        {/* Zone 4: Material Close-Ups */}
        <MaterialCloseups />

        {/* Zone 5: Specifications + Care */}
        <Specifications />

        {/* Zone 6: Maker Story */}
        <MakerStory />

        {/* Zone 7: Pairs With */}
        <PairsWith />

        {/* Zone 8: Designer Intelligence (designer-only) */}
        <DesignerIntelligence />
      </div>
    </>
  );
}

// ── Page Entry ─────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const params = useParams();
  const id = params.id as string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawProduct, isLoading } = useProduct(id) as { data: any; isLoading: boolean };

  if (isLoading) return <LoadingStrata />;

  const product = rawProduct?.product || rawProduct;
  if (!product?.id) {
    return (
      <div className="py-16 text-center">
        <p className="type-body italic text-[var(--text-muted)]">Product not found.</p>
      </div>
    );
  }

  return (
    <ProductEditProvider product={product}>
      <ProductDetailContent />
    </ProductEditProvider>
  );
}
