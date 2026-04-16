'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  ProductEditProvider,
  useProductEdit,
  HeroGallery,
  ProductIdentity,
  ProductStory,
  MaterialCloseups,
  Specifications,
  MakerStory,
  PairsWith,
  DesignerIntelligence,
  defaultNormalize,
  type ProductDraft,
  type ValidationResult,
  type BaseProductDraft,
} from '@patina/catalog-ui';
import {
  useProduct,
  useUpdateProduct,
  useDeleteProduct,
  usePublishProduct,
  useUnpublishProduct,
} from '@/hooks/use-admin-products';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { AdminEditBar } from '@/components/catalog/detail/admin-edit-bar';
import { ValidationIssuesBar } from '@/components/catalog/detail/validation-issues-bar';
import { VariantsPanel } from '@/components/catalog/detail/variants-panel';
import { SEOPanel } from '@/components/catalog/detail/seo-panel';

// ── Admin extras ───────────────────────────────────────────────────────

interface AdminExtras {
  msrp?: number;
  salePrice?: number;
  currency: string;
  slug: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
  shortDescription?: string;
  longDescription?: string;
  [key: string]: unknown;
}

type AdminProductDraft = ProductDraft<AdminExtras>;

// ── Validation ─────────────────────────────────────────────────────────

const validationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
  brand: z.string().min(1, 'Brand is required').max(100, 'Brand too long'),
  price: z.number().min(0, 'Price must be positive'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  seoTitle: z.string().max(60, 'SEO title should be under 60 characters').optional(),
  seoDescription: z.string().max(160, 'SEO description should be under 160 characters').optional(),
});

function runValidation(draft: AdminProductDraft): ValidationResult {
  const result = validationSchema.safeParse(draft);
  if (result.success) return { valid: true, issues: [] };
  return {
    valid: false,
    issues: result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
      severity: 'error' as const,
    })),
  };
}

// ── Normalize raw product → AdminProductDraft ──────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeAdmin(raw: any): AdminProductDraft {
  const base = defaultNormalize(raw) as BaseProductDraft;
  const p = raw?.product || raw || {};
  const extras: AdminExtras = {
    msrp: p.msrp || undefined,
    salePrice: p.salePrice || p.sale_price || undefined,
    currency: p.currency || 'USD',
    slug: p.slug || '',
    seoTitle: p.seoTitle || p.seo_title || '',
    seoDescription: p.seoDescription || p.seo_description || '',
    seoKeywords: p.seoKeywords || p.seo_keywords || [],
    shortDescription: p.shortDescription || p.short_description || '',
    longDescription: p.longDescription || p.long_description || '',
  };
  return { ...base, ...extras };
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────

function KeyboardShortcuts() {
  const { toggleMode, saveNow, mode } = useProductEdit();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        toggleMode();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && mode === 'edit') {
        e.preventDefault();
        void saveNow();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleMode, saveNow, mode]);

  return null;
}

// ── Content ────────────────────────────────────────────────────────────

function AdminProductDetailContent({ productId }: { productId: string }) {
  return (
    <>
      <KeyboardShortcuts />
      <AdminEditBar />
      <ValidationIssuesBar />

      <div className="px-[clamp(1.5rem,5vw,2.5rem)] pt-6">
        <HeroGallery />
        <ProductIdentity hideActions />
        <ProductStory />
        <MaterialCloseups />
        <Specifications />
        <MakerStory />
        <PairsWith />
        <DesignerIntelligence />
        <VariantsPanel productId={productId} />
        <SEOPanel />
      </div>
    </>
  );
}

// ── Entry ──────────────────────────────────────────────────────────────

interface ProductEditPageClientProps {
  productId: string;
}

export function ProductEditPageClient({ productId }: ProductEditPageClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { product, isLoading, error } = useProduct(productId);

  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const publishProduct = usePublishProduct();
  const unpublishProduct = useUnpublishProduct();

  const handleSave = useCallback(
    async (draft: AdminProductDraft) => {
      await updateProduct.mutateAsync({
        productId: draft.id,
        data: {
          name: draft.name,
          brand: draft.brand,
          status: draft.status,
          shortDescription: draft.shortDescription || draft.description,
          longDescription: draft.longDescription || draft.description,
          price: draft.price,
          msrp: draft.msrp,
          sale_price: draft.salePrice,
          currency: draft.currency,
          slug: draft.slug,
          seo_title: draft.seoTitle,
          seo_description: draft.seoDescription,
          seo_keywords: draft.seoKeywords,
          materials: draft.materials.length ? draft.materials : undefined,
          dimensions: draft.dimensions,
          weight: draft.weight,
          finish: draft.finish,
          assembly: draft.assembly,
          care_instructions: draft.careInstructions,
          images: draft.images.map((img) => img.url),
          tier: draft.tier,
          style_tags: draft.styleTags,
          provenance: draft.provenance,
        },
      });
    },
    [updateProduct]
  );

  const handlePublish = useCallback(async () => {
    await publishProduct.mutateAsync({ productId });
  }, [publishProduct, productId]);

  const handleUnpublish = useCallback(
    async (_reason: string | undefined) => {
      // The admin unpublish endpoint currently accepts no body; the reason is captured
      // client-side and can be wired into the audit trail when the API accepts it.
      await unpublishProduct.mutateAsync(productId);
    },
    [unpublishProduct, productId]
  );

  const handleDelete = useCallback(async () => {
    await deleteProduct.mutateAsync(productId);
    router.push('/catalog');
  }, [deleteProduct, productId, router]);

  const handleToast = useCallback(
    (message: string, variant: 'success' | 'error' | 'warning' | 'info') => {
      toast({
        title: message,
        variant: variant === 'error' ? 'destructive' : 'default',
      });
    },
    [toast]
  );

  const memoizedSchema = useMemo(() => runValidation, []);

  if (isLoading) return <ProductEditSkeleton />;

  if (error || !product) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground italic">Product not found.</p>
      </div>
    );
  }

  return (
    <ProductEditProvider<AdminExtras>
      product={product}
      normalize={normalizeAdmin}
      onSave={handleSave}
      onPublish={handlePublish}
      onUnpublish={handleUnpublish}
      onDelete={handleDelete}
      onValidate={memoizedSchema}
      onToast={handleToast}
    >
      <AdminProductDetailContent productId={productId} />
    </ProductEditProvider>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────

export function ProductEditSkeleton() {
  return (
    <div className="px-[clamp(1.5rem,5vw,2.5rem)] pt-6">
      <Skeleton className="mb-6 h-10 w-2/3" />
      <Skeleton className="mb-6 aspect-[4/3] w-full rounded-lg" />
      <Skeleton className="mb-3 h-12 w-1/2" />
      <Skeleton className="mb-6 h-6 w-1/3" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
