'use client';

import { useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useProduct } from '@/hooks/use-products';
import { Breadcrumb, LoadingStrata } from '@/components/portal';
import { useToast } from '@/components/portal/toast-provider';
import { catalogApi } from '@/lib/api-client';
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
  type ProductDraft,
} from '@/components/product-detail';
import { PairsWith } from '@/components/product-detail/pairs-with';
import { DesignerIntelligence } from '@/components/product-detail/designer-intelligence';

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

// ── Page Content ───────────────────────────────────────────────────────

function ProductDetailContent() {
  const { mode, draft, toggleMode } = useProductEdit();

  return (
    <>
      <KeyboardShortcuts />
      <EditModeBar />

      <div className="px-[clamp(1.5rem,5vw,2.5rem)] pt-6">
        <Breadcrumb
          items={[
            { label: 'Products', href: '/portal/catalog' },
            { label: draft.name || 'Product' },
          ]}
        />

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

        <HeroGallery />
        <ProductIdentity />
        <ProductStory />
        <MaterialCloseups />
        <Specifications />
        <MakerStory />
        <PairsWith />
        <DesignerIntelligence />
      </div>
    </>
  );
}

// ── Page Entry ─────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawProduct, isLoading } = useProduct(id) as { data: any; isLoading: boolean };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const product = rawProduct?.product || rawProduct;

  const handleSave = useCallback(
    async (draft: ProductDraft) => {
      await catalogApi.updateProduct(draft.id, {
        name: draft.name,
        description: draft.description,
        price: draft.price || undefined,
        brand: draft.brand || undefined,
        status: draft.status,
        tier: draft.tier || undefined,
        provenance: draft.provenance || undefined,
        finish: draft.finish || undefined,
        assembly: draft.assembly || undefined,
        tradePrice: draft.tradePrice || undefined,
        mapPrice: draft.mapPrice || undefined,
        commissionRate: draft.commissionRate || undefined,
        careInstructions: draft.careInstructions || undefined,
        arModelUrl: draft.arModelUrl || undefined,
        materials: draft.materials.length ? draft.materials : undefined,
        images: draft.images.map((img) => img.url),
      });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', draft.id] });
    },
    [queryClient]
  );

  if (isLoading) return <LoadingStrata />;

  if (!product?.id) {
    return (
      <div className="py-16 text-center">
        <p className="type-body italic text-[var(--text-muted)]">Product not found.</p>
      </div>
    );
  }

  return (
    <ProductEditProvider product={product} onSave={handleSave} onToast={toast}>
      <ProductDetailContent />
    </ProductEditProvider>
  );
}
