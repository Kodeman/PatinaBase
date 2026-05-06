'use client';

import { useState, useEffect } from 'react';
import { useProducts, useCreateDraftProduct } from '@patina/supabase';
import { PortalButton } from '@/components/portal/button';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProductPickerModalProps {
  open: boolean;
  onClose: () => void;
  /** Called when the user picks a product (catalog or freshly-created draft). */
  onPick: (productId: string) => void;
  /**
   * Default category slug to attach to the picked item — surfaced as a
   * subtle hint above the list. Wave 1 doesn't filter by category yet.
   */
  defaultCategorySlug?: string;
  /** Show the Quick-create draft tab. Defaults to true. */
  allowDraftCreate?: boolean;
}

type Tab = 'catalog' | 'draft';

interface CatalogProductRow {
  id: string;
  name: string;
  brand: string | null;
  price_retail: number | null;
  vendor?: { name?: string | null } | null;
  images: string[];
}

// ─── Catalog tab ──────────────────────────────────────────────────────────────

function CatalogTab({
  defaultCategorySlug,
  onPick,
}: {
  defaultCategorySlug?: string;
  onPick: (productId: string) => void;
}) {
  const [search, setSearch] = useState('');
  // useProducts defaults to status='published' — exactly what we want.
  const { data, isLoading, isError, error } = useProducts(
    { search: search.trim() || undefined },
    { page: 1, pageSize: 24 }
  );

  const products: CatalogProductRow[] = (data?.data ?? []) as CatalogProductRow[];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the catalog by product name…"
          className="type-body w-full rounded-sm border border-[var(--border-default)] bg-transparent px-3 py-2 text-[0.85rem] outline-none transition-colors focus:border-[var(--accent-primary)]"
        />
      </div>

      {defaultCategorySlug && (
        <div
          className="rounded-sm border border-dashed px-3 py-2 text-[0.72rem]"
          style={{
            borderColor: 'var(--border-default)',
            color: 'var(--text-muted)',
          }}
        >
          Picking for category{' '}
          <span style={{ color: 'var(--text-primary)' }}>{defaultCategorySlug}</span>
        </div>
      )}

      {isLoading && (
        <div
          className="py-8 text-center type-body"
          style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}
        >
          Loading catalog…
        </div>
      )}

      {isError && (
        <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {(error as Error)?.message ?? 'Failed to load catalog.'}
        </div>
      )}

      {!isLoading && !isError && products.length === 0 && (
        <div
          className="py-8 text-center type-body"
          style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}
        >
          No products found. Try a different search or quick-create a draft.
        </div>
      )}

      {!isLoading && products.length > 0 && (
        <div className="grid max-h-[380px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              className="group flex cursor-pointer flex-col items-stretch gap-2 rounded-sm border border-[var(--border-default)] p-2 text-left transition-colors hover:border-[var(--accent-primary)]"
            >
              <div
                className="relative w-full overflow-hidden rounded-sm bg-[var(--bg-surface)]"
                style={{ aspectRatio: '1 / 1' }}
              >
                {p.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.images[0]}
                    alt={p.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center"
                    style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}
                  >
                    No image
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                <div
                  className="line-clamp-2"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.78rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  {p.name}
                </div>
                {(p.brand || p.vendor?.name) && (
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.68rem',
                      fontStyle: 'italic',
                      color: 'var(--color-aged-oak)',
                    }}
                  >
                    {p.brand ?? p.vendor?.name}
                  </div>
                )}
                {typeof p.price_retail === 'number' && (
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 500,
                      fontSize: '0.78rem',
                      color: 'var(--text-primary)',
                    }}
                  >
                    ${(p.price_retail / 100).toLocaleString()}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Quick-create draft tab ────────────────────────────────────────────────────

function DraftTab({ onPick }: { onPick: (productId: string) => void }) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [priceDollars, setPriceDollars] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const create = useCreateDraftProduct();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setErrorMessage(null);
    try {
      const parsed = priceDollars ? Number(priceDollars) : undefined;
      const result = await create.mutateAsync({
        name,
        brand: brand || undefined,
        sourceUrl: sourceUrl || undefined,
        priceRetailDollars:
          parsed !== undefined && !Number.isNaN(parsed) ? parsed : undefined,
      });
      onPick(result.id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create draft');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p
        className="type-body"
        style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}
      >
        Create a stub product so you can spec it on the proposal now. You can fill in
        catalog details later — it stays in <span style={{ color: 'var(--text-primary)' }}>draft</span>{' '}
        until you publish it.
      </p>

      <label className="block">
        <span className="type-meta mb-1 block">Product Name *</span>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Holly Hunt Cardamom Lounge Chair"
          className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
        />
      </label>

      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="block">
          <span className="type-meta mb-1 block">Brand</span>
          <input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g. Holly Hunt"
            className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
          />
        </label>
        <label className="block">
          <span className="type-meta mb-1 block">Retail Price</span>
          <div className="relative">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-body text-[0.88rem]"
              style={{ color: 'var(--text-muted)' }}
            >
              $
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
              placeholder="0"
              className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent py-2 pl-7 pr-3 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
            />
          </div>
        </label>
      </div>

      <label className="block">
        <span className="type-meta mb-1 block">Source URL</span>
        <input
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2 font-body text-[0.88rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]"
        />
      </label>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {errorMessage}
        </div>
      )}

      <div className="flex gap-2">
        <PortalButton
          variant="primary"
          type="submit"
          disabled={!name.trim() || create.isPending}
        >
          {create.isPending ? 'Creating…' : 'Create draft + use'}
        </PortalButton>
      </div>
    </form>
  );
}

// ─── Modal shell ─────────────────────────────────────────────────────────────

export function ProductPickerModal({
  open,
  onClose,
  onPick,
  defaultCategorySlug,
  allowDraftCreate = true,
}: ProductPickerModalProps) {
  const [tab, setTab] = useState<Tab>('catalog');

  // Reset to the catalog tab whenever the modal opens.
  useEffect(() => {
    if (open) setTab('catalog');
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const handlePick = (id: string) => {
    onPick(id);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-picker-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[720px] rounded-md border bg-[var(--bg-surface)] p-6 shadow-xl"
        style={{ borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <h3 id="product-picker-title" className="type-section-head" style={{ fontSize: '1.2rem' }}>
            Add a product
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[1.1rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Product picker"
          className="mb-4 flex gap-1 border-b"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <button
            role="tab"
            type="button"
            aria-selected={tab === 'catalog'}
            onClick={() => setTab('catalog')}
            className={`cursor-pointer px-3 py-2 font-body text-[0.82rem] font-medium transition-colors ${
              tab === 'catalog'
                ? 'border-b-2 border-[var(--accent-primary)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Catalog
          </button>
          {allowDraftCreate && (
            <button
              role="tab"
              type="button"
              aria-selected={tab === 'draft'}
              onClick={() => setTab('draft')}
              className={`cursor-pointer px-3 py-2 font-body text-[0.82rem] font-medium transition-colors ${
                tab === 'draft'
                  ? 'border-b-2 border-[var(--accent-primary)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Quick-create draft
            </button>
          )}
        </div>

        {/* Panels */}
        {tab === 'catalog' && (
          <CatalogTab defaultCategorySlug={defaultCategorySlug} onPick={handlePick} />
        )}
        {tab === 'draft' && allowDraftCreate && <DraftTab onPick={handlePick} />}
      </div>
    </div>
  );
}
