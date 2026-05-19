'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCategories } from '@/hooks/use-products';
import { catalogApi } from '@/lib/api-client';
import {
  Breadcrumb,
  StrataMark,
  PortalButton,
  UploadZone,
} from '@/components/portal';
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

  const handleSave = (publish: boolean) => {
    if (!form.name.trim()) return;
    createProduct.mutate(
      {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        price: form.retailPrice ? parseFloat(form.retailPrice) : undefined,
        brand: form.maker.trim() || undefined,
        category: form.category || undefined,
        tier: form.tier || undefined,
        status: publish ? 'published' : 'draft',
      },
      { onSuccess: () => router.push('/portal/catalog') }
    );
  };

  return (
    <div className="pt-8">
      <Breadcrumb
        items={[
          { label: 'Products', href: '/portal/catalog' },
          { label: 'Add New Product' },
        ]}
      />

      {/* Page Header */}
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="type-page-title" style={{ fontSize: '1.5rem' }}>
          Add New Product
        </h1>
        <div className="flex gap-2">
          <PortalButton
            variant="primary"
            className="text-[0.8rem]"
            onClick={() => handleSave(false)}
            disabled={createProduct.isPending || !form.name.trim()}
          >
            Save as Draft
          </PortalButton>
          <PortalButton
            variant="secondary"
            className="text-[0.8rem]"
            onClick={() => handleSave(true)}
            disabled={createProduct.isPending || !form.name.trim()}
          >
            Publish
          </PortalButton>
        </div>
      </div>

      {/* Layer 1 · Ambient intro under the "Add New Product" header. Helps the
          designer understand what's worth filling in now vs deferring to a
          teaching session. */}
      <SectionIntro
        surfaceKey={SurfaceKeys.DesignerPortal.Products.Capture.New.Intro}
        fallback="Capture the essentials now — name, maker, and a hero photo. Aesthete details and full provenance can be added later in a teaching session."
        className="mb-6 max-w-prose"
      />

      {/* Image First */}
      <UploadZone
        onFiles={(files) => {
          // TODO: wire to media service
          console.log('Upload files:', files);
        }}
        accept="image/*"
        description="Start with the product image"
        label="Drop images here or click to upload"
        hint="This is what designers and clients see first. Lead with the hero shot."
        className="mb-8 min-h-[180px]"
      />

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
