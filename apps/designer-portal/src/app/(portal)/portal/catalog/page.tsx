'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useProducts } from '@/hooks/use-products';
import {
  SearchInput,
  FilterRow,
  LoadingStrata,
  PortalButton,
  ProductCard,
  ProductListItem,
  EmptyState,
  CatalogRefineBar,
} from '@/components/portal';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProduct = any;

const styleFilters = [
  'All Styles',
  'Warm Minimalist',
  'Organic Modern',
  'Midcentury',
  'Moody Traditional',
  'Coastal Calm',
  'Bold Eclectic',
];

const categoryFilters = [
  'All',
  'Seating',
  'Tables',
  'Storage',
  'Lighting',
  'Rugs',
  'Décor',
  'Outdoor',
];

export default function CatalogPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [styleFilter, setStyleFilter] = useState('All Styles');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Close add menu on outside click
  useEffect(() => {
    if (!addMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [addMenuOpen]);

  // Map tier filter to API status/tier params
  const filterParams = useMemo(() => {
    const params: Record<string, string | undefined> = {
      search: search || undefined,
    };
    if (tierFilter === 'drafts') params.status = 'draft';
    else if (tierFilter === 'needs_teaching') params.status = 'in_review';
    else if (tierFilter === 'maker_piece' || tierFilter === 'designers_pick' || tierFilter === 'sourced') {
      params.tier = tierFilter;
    }
    if (categoryFilter !== 'All') params.category = categoryFilter.toLowerCase();
    return params;
  }, [search, tierFilter, categoryFilter]);

  const { data: rawProducts, isLoading } = useProducts(filterParams, true);

  const products: AnyProduct[] = Array.isArray(rawProducts)
    ? rawProducts
    : rawProducts?.products
      ? rawProducts.products
      : [];

  // Client-side style filter
  const filteredProducts = useMemo(() => {
    if (styleFilter === 'All Styles') return products;
    return products.filter(
      (p: AnyProduct) =>
        p.styleTags?.includes(styleFilter) || p.style_tags?.includes(styleFilter)
    );
  }, [products, styleFilter]);

  const canCreate = !!user;

  const getPrice = (p: AnyProduct) =>
    p.price ? Number(p.price) : p.base_price ? Number(p.base_price) : 0;

  const handleProductClick = (id: string) => router.push(`/portal/catalog/${id}`);
  const handleTeach = (id: string) => router.push(`/portal/teaching/product/${id}`);
  const handleEdit = (id: string) => router.push(`/portal/catalog/${id}/edit`);

  return (
    <div className="pt-6">
      {/* Band 1: Title + Search + View Toggle + Add */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h1 className="type-section-head">Products</h1>
        <div className="flex items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name, maker, style…"
            className="max-w-[220px]"
          />
          <div className="flex gap-1.5">
            <button
              className={`cursor-pointer border-0 bg-transparent font-mono text-[0.68rem] uppercase tracking-[0.06em] ${
                viewMode === 'grid' ? 'text-[var(--text-primary)] opacity-100' : 'text-[var(--text-muted)] opacity-40'
              }`}
              onClick={() => setViewMode('grid')}
            >
              ▦ Grid
            </button>
            <button
              className={`cursor-pointer border-0 bg-transparent font-mono text-[0.68rem] uppercase tracking-[0.06em] ${
                viewMode === 'list' ? 'text-[var(--text-primary)] opacity-100' : 'text-[var(--text-muted)] opacity-40'
              }`}
              onClick={() => setViewMode('list')}
            >
              ☰ List
            </button>
          </div>
          {canCreate && (
            <div className="relative" ref={addMenuRef}>
              <PortalButton
                variant="primary"
                className="px-2.5 py-1 text-[0.75rem]"
                onClick={() => setAddMenuOpen((v) => !v)}
              >
                +
              </PortalButton>
              {addMenuOpen && (
                <div
                  className="absolute right-0 top-full z-20 mt-1 flex flex-col rounded border border-[var(--border-default)] bg-[var(--bg-primary)] py-1 shadow-sm"
                  style={{ minWidth: '140px' }}
                >
                  <button
                    className="cursor-pointer border-0 bg-transparent px-3 py-1.5 text-left text-[0.8rem] text-[var(--text-body)] hover:bg-[var(--bg-hover)]"
                    onClick={() => { router.push('/portal/catalog/new'); setAddMenuOpen(false); }}
                  >
                    Add Product
                  </button>
                  <button
                    className="cursor-pointer border-0 bg-transparent px-3 py-1.5 text-left text-[0.8rem] text-[var(--text-body)] hover:bg-[var(--bg-hover)]"
                    onClick={() => { router.push('/portal/catalog/import'); setAddMenuOpen(false); }}
                  >
                    Import
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Band 2: Tier Filters */}
      <FilterRow
        options={[
          { key: 'all', label: 'All Products', count: products.length },
          { key: 'maker_piece', label: '★ Maker Pieces' },
          { key: 'designers_pick', label: '✓ Designer Picks' },
          { key: 'sourced', label: '○ Sourced' },
          { key: 'needs_teaching', label: 'Needs Teaching' },
          { key: 'drafts', label: 'Drafts' },
        ]}
        active={tierFilter}
        onChange={setTierFilter}
      />

      {/* Band 3: Refine (collapsed by default) */}
      <CatalogRefineBar
        styleFilter={styleFilter}
        onStyleChange={setStyleFilter}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        styleOptions={styleFilters}
        categoryOptions={categoryFilters}
      />

      {/* Content */}
      {isLoading ? (
        <LoadingStrata />
      ) : filteredProducts.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="mt-4 grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {filteredProducts.map((product: AnyProduct) => (
              <ProductCard
                key={product.id}
                id={product.id}
                name={product.name}
                maker={product.brand || product.vendor_name}
                makerLocation={product.maker_location}
                imageUrl={product.coverImage || product.cover_image || (typeof product.images?.[0] === 'string' ? product.images[0] : product.images?.[0]?.url)}
                price={getPrice(product)}
                tier={product.tier}
                aiScore={product.aiScore ?? product.ai_score}
                status={product.status}
                onClick={handleProductClick}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <div
              className="grid items-center gap-4 border-b border-[var(--border-subtle)] py-2"
              style={{ gridTemplateColumns: '80px 1fr 120px 100px 120px' }}
            >
              <span className="font-mono text-[0.5rem] uppercase tracking-[0.04em] text-[var(--text-muted)]" />
              <span className="font-mono text-[0.5rem] uppercase tracking-[0.04em] text-[var(--text-muted)]">
                Product
              </span>
              <span className="text-right font-mono text-[0.5rem] uppercase tracking-[0.04em] text-[var(--text-muted)]">
                Price
              </span>
              <span className="text-center font-mono text-[0.5rem] uppercase tracking-[0.04em] text-[var(--text-muted)]">
                AI Score
              </span>
              <span className="text-right font-mono text-[0.5rem] uppercase tracking-[0.04em] text-[var(--text-muted)]">
                Actions
              </span>
            </div>
            {filteredProducts.map((product: AnyProduct) => (
              <ProductListItem
                key={product.id}
                id={product.id}
                name={product.name}
                maker={product.brand || product.vendor_name}
                tier={product.tier}
                thumbUrl={product.coverImage || product.cover_image || (typeof product.images?.[0] === 'string' ? product.images[0] : product.images?.[0]?.url)}
                price={getPrice(product)}
                aiScore={product.aiScore ?? product.ai_score}
                status={product.status}
                onTeach={handleTeach}
                onEdit={handleEdit}
                onClick={handleProductClick}
              />
            ))}
          </div>
        )
      ) : (
        <EmptyState
          title={search ? 'No products found' : 'Your catalog is empty'}
          description={
            search
              ? 'Try adjusting your search or filters.'
              : 'Add your first product to start building your curated catalog.'
          }
          actionLabel={!search && canCreate ? 'Add Product' : undefined}
          onAction={!search && canCreate ? () => router.push('/portal/catalog/new') : undefined}
        />
      )}
    </div>
  );
}
