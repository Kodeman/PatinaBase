'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCategories } from '@/hooks/use-products';
import { useImageUpload } from '@/hooks/use-image-upload';
import { catalogApi } from '@/lib/api-client';
import {
  StrataMark,
  UploadZone,
} from '@/components/portal';
import { ListPageHeader } from '@/components/portal/list-page-header';
import { Button } from '@/components/ui/controls';
import {
  FieldHelper,
  FieldLabel,
  InfoIcon,
  SectionIntro,
  StrataInfoIcon,
  SurfaceKeys,
} from '@patina/help-system';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCategory = any;

const fieldClass =
  'w-full rounded-[3px] border border-[var(--color-pearl)] bg-[var(--bg-surface)] px-3 py-2.5 font-body text-[0.85rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]';
// `labelClass` is kept for any remaining non-help-system labels — new fields use
// `<FieldLabel />` from @patina/help-system instead (spec §4.4).
const labelClass =
  'block font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1.5';
const sectionHeadClass =
  'type-item-name mb-4 pb-2 border-b border-[var(--border-subtle)]';

export default function NewProductPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: rawCategories } = useCategories();
  const categories = (Array.isArray(rawCategories) ? rawCategories : []) as AnyCategory[];

  const createProduct = useMutation({
    mutationFn: (data: Record<string, unknown>) => catalogApi.createProduct(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const { upload: uploadImage } = useImageUpload();
  // Images can't upload until the product row exists (it owns the id used in
  // the storage path + the `products.images` array). Stage selected files in
  // component state and POST them after the create call returns the new id.
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  const [form, setForm] = useState({
    name: '',
    maker: '',
    tier: '',
    category: '',
    description: '',
    retailPrice: '',
    leadTime: '',
    dimensions: '',
    material: '',
  });

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSave = async (publish: boolean) => {
    if (!form.name.trim()) return;
    // Parse the free-text lead time ("8–12 weeks") into the integer
    // `lead_time_weeks` column; fall back to undefined when no number is present.
    const leadTimeMatch = form.leadTime.match(/\d+/);
    const material = form.material.trim();
    const dimensions = form.dimensions.trim();

    const created = await createProduct.mutateAsync({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      price: form.retailPrice ? parseFloat(form.retailPrice.replace(/[^0-9.]/g, '')) || undefined : undefined,
      brand: form.maker.trim() || undefined,
      category: form.category || undefined,
      tier: form.tier || undefined,
      leadTimeWeeks: leadTimeMatch ? parseInt(leadTimeMatch[0], 10) : undefined,
      materials: material ? [material] : undefined,
      dimensions: dimensions || undefined,
      status: publish ? 'published' : 'draft',
    });

    // The product now exists — upload any staged hero images against its id.
    // Defensively unwrap the new id from common response shapes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = created as any;
    const newId: string | undefined = res?.id ?? res?.data?.id ?? res?.product?.id;
    if (newId && stagedFiles.length > 0) {
      for (const file of stagedFiles) {
        await uploadImage(`/api/catalog/products/${newId}/images`, file);
      }
    }

    // New products are layer='personal', so return to My Library where they land.
    router.push('/portal/library/personal');
  };

  return (
    <div className="pt-8">
      {/* Breadcrumb ("Products › Catalog › New") is rendered globally by SubNav. */}
      <ListPageHeader
        title="Add New Product"
        actions={
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleSave(false)}
              disabled={createProduct.isPending || !form.name.trim()}
            >
              Save as Draft
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleSave(true)}
              disabled={createProduct.isPending || !form.name.trim()}
            >
              Publish
            </Button>
          </>
        }
      />

      {/* Layer 1 · Ambient intro under the "Add New Product" header. Helps the
          designer understand what's worth filling in now vs deferring to a
          teaching session. */}
      <SectionIntro
        surfaceKey={SurfaceKeys.DesignerPortal.Products.Capture.New.Intro}
        fallback="Capture the essentials now — name, maker, and a hero photo. Aesthete details and full provenance can be added later in a teaching session."
        className="mb-6 max-w-prose"
      />

      {/* Image First. Files are staged here and uploaded on Save (after the
          product id exists) — see handleSave. */}
      <UploadZone
        onFiles={(files) => setStagedFiles((prev) => [...prev, ...files])}
        accept="image/*"
        description="Start with the product image"
        label="Drop images here or click to upload"
        hint="This is what designers and clients see first. Lead with the hero shot."
        className="mb-2 min-h-[180px]"
      />
      {stagedFiles.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-3">
          {stagedFiles.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="relative h-20 w-20 overflow-hidden rounded-md border border-[var(--color-pearl)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(file)}
                alt={file.name}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => setStagedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 text-[0.7rem] leading-none text-[var(--color-terracotta)] shadow"
                aria-label={`Remove ${file.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ===== Product Identity ===== */}
      <h3 className={sectionHeadClass}>Product Identity</h3>
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
        <div>
          <FieldLabel htmlFor="new-product-name" required className="mb-1.5">
            Product Name
          </FieldLabel>
          <input
            id="new-product-name"
            className={fieldClass}
            value={form.name}
            onChange={set('name')}
            placeholder="e.g. Heirloom Oak Dining Table"
            required
          />
        </div>
        <div>
          <FieldLabel htmlFor="new-product-maker" className="mb-1.5">
            Maker / Brand
          </FieldLabel>
          <input
            id="new-product-maker"
            className={fieldClass}
            value={form.maker}
            onChange={set('maker')}
            placeholder="e.g. Nordic Atelier"
          />
        </div>
        <div>
          {/* Tier is a Patina-coined product concept — use StrataInfoIcon per
              spec §4.2 so the affordance signals "this is platform vocabulary,
              not generic terminology". */}
          <FieldLabel htmlFor="new-product-tier" className="mb-1.5">
            Product Tier
            <StrataInfoIcon
              surfaceKey={SurfaceKeys.DesignerPortal.Products.Detail.Concepts.Tier}
              fallback="Patina tier — Maker Pieces are commissioned, Designer Picks are vetted vendor items, Sourced are off-the-shelf finds."
              ariaLabel="About Patina product tiers"
            />
          </FieldLabel>
          <select
            id="new-product-tier"
            className={fieldClass}
            value={form.tier}
            onChange={set('tier')}
            style={{ appearance: 'none' }}
          >
            <option value="">Select tier…</option>
            <option value="maker_piece">★ Maker Piece</option>
            <option value="designers_pick">✓ Designer&apos;s Pick</option>
            <option value="sourced">○ Sourced Selection</option>
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="new-product-category" className="mb-1.5">
            Category
          </FieldLabel>
          <select
            id="new-product-category"
            className={fieldClass}
            value={form.category}
            onChange={set('category')}
            style={{ appearance: 'none' }}
          >
            <option value="">Select category…</option>
            {categories.length > 0
              ? categories.map((cat: AnyCategory) => (
                  <option key={cat.id || cat.name} value={cat.name || cat.slug}>{cat.name}</option>
                ))
              : ['Seating', 'Tables', 'Storage', 'Lighting', 'Rugs', 'Décor'].map((c) => (
                  <option key={c} value={c.toLowerCase()}>{c}</option>
                ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <FieldLabel htmlFor="new-product-description" optional className="mb-1.5">
            Description
          </FieldLabel>
          <textarea
            id="new-product-description"
            className={`${fieldClass} min-h-[80px] resize-y`}
            rows={3}
            value={form.description}
            onChange={set('description')}
            placeholder="Tell the product's story. What makes it special? What should a client know?"
          />
        </div>
      </div>

      <StrataMark variant="mini" />

      {/* ===== Quick Specs & Pricing ===== */}
      <h3 className={sectionHeadClass}>Quick Specs & Pricing</h3>
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
        <div>
          <FieldLabel htmlFor="new-product-retail-price" className="mb-1.5">
            Retail Price
            <InfoIcon
              surfaceKey={SurfaceKeys.DesignerPortal.Products.Detail.Specs.TradePrice}
              fallback="What clients see in the proposal. Trade pricing lives on the detail page."
              ariaLabel="About retail price"
            />
          </FieldLabel>
          <input
            id="new-product-retail-price"
            className={fieldClass}
            value={form.retailPrice}
            onChange={set('retailPrice')}
            placeholder="$0.00"
          />
        </div>
        <div>
          <FieldLabel htmlFor="new-product-lead-time" className="mb-1.5">
            Lead Time
          </FieldLabel>
          <input
            id="new-product-lead-time"
            className={fieldClass}
            value={form.leadTime}
            onChange={set('leadTime')}
            placeholder="e.g. 8–12 weeks"
          />
          <FieldHelper
            surfaceKey={SurfaceKeys.DesignerPortal.Products.Detail.Specs.LeadTime}
            fallback="A range is fine — clients see this on the proposal, so be honest."
            className="mt-1.5 text-[0.72rem]"
          />
        </div>
        <div>
          <FieldLabel htmlFor="new-product-dimensions" className="mb-1.5">
            Dimensions
          </FieldLabel>
          <input
            id="new-product-dimensions"
            className={fieldClass}
            value={form.dimensions}
            onChange={set('dimensions')}
            placeholder='e.g. 72"L × 36"W × 30"H'
          />
          <FieldHelper
            surfaceKey={SurfaceKeys.DesignerPortal.Products.Detail.Specs.Dimensions}
            fallback="Length × Width × Height. Use the format that matches the maker's spec sheet."
            className="mt-1.5 text-[0.72rem]"
          />
        </div>
        <div>
          <FieldLabel htmlFor="new-product-material" className="mb-1.5">
            Primary Material
          </FieldLabel>
          <input
            id="new-product-material"
            className={fieldClass}
            value={form.material}
            onChange={set('material')}
            placeholder="e.g. Solid white oak"
          />
        </div>
      </div>

      {/* Tip Panel */}
      <div className="mt-8 rounded-md border border-[rgba(196,165,123,0.15)] bg-[rgba(196,165,123,0.04)] p-4">
        <p className="mb-1 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--accent-primary)]">
          Tip — Save now, teach later
        </p>
        <p className="font-body text-[0.82rem] text-[var(--text-body)]">
          You can save this product as a draft and come back to add Aesthete intelligence during a
          teaching session. Products from the Chrome Extension arrive here with images and basic info
          pre-filled.
        </p>
      </div>
    </div>
  );
}
