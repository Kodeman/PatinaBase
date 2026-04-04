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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCategory = any;

const fieldClass =
  'w-full rounded-[3px] border border-[var(--color-pearl)] bg-[var(--bg-surface)] px-3 py-2.5 font-body text-[0.85rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]';
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
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
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
          <label className={labelClass}>Product Name</label>
          <input className={fieldClass} value={form.name} onChange={set('name')} placeholder="e.g. Heirloom Oak Dining Table" />
        </div>
        <div>
          <label className={labelClass}>Maker / Brand</label>
          <input className={fieldClass} value={form.maker} onChange={set('maker')} placeholder="e.g. Nordic Atelier" />
        </div>
        <div>
          <label className={labelClass}>Product Tier</label>
          <select className={fieldClass} value={form.tier} onChange={set('tier')} style={{ appearance: 'none' }}>
            <option value="">Select tier…</option>
            <option value="maker_piece">★ Maker Piece</option>
            <option value="designers_pick">✓ Designer&apos;s Pick</option>
            <option value="sourced">○ Sourced Selection</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Category</label>
          <select className={fieldClass} value={form.category} onChange={set('category')} style={{ appearance: 'none' }}>
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
          <label className={labelClass}>Description</label>
          <textarea
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
          <label className={labelClass}>Retail Price</label>
          <input className={fieldClass} value={form.retailPrice} onChange={set('retailPrice')} placeholder="$0.00" />
        </div>
        <div>
          <label className={labelClass}>Lead Time</label>
          <input className={fieldClass} value={form.leadTime} onChange={set('leadTime')} placeholder="e.g. 8–12 weeks" />
        </div>
        <div>
          <label className={labelClass}>Dimensions</label>
          <input className={fieldClass} value={form.dimensions} onChange={set('dimensions')} placeholder='e.g. 72"L × 36"W × 30"H' />
        </div>
        <div>
          <label className={labelClass}>Primary Material</label>
          <input className={fieldClass} value={form.material} onChange={set('material')} placeholder="e.g. Solid white oak" />
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
