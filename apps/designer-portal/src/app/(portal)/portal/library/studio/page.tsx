'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useLayerProducts, type LayerProductRow } from '@patina/supabase';
import { EmptyState, ProductCard } from '@patina/catalog-ui';
import { LoadingStrata } from '@/components/portal/loading-strata';

type ViewMode = 'by-vendor' | 'by-category';

/**
 * Studio LayerView. Two grouping modes: By Vendor (default) and By
 * Category. RLS in migration 00152 enforces visibility — non-members
 * of a given studio see nothing here.
 *
 * v1 scope:
 *   • Group + render headers via simple client-side bucketing
 *   • Filter by search (name/brand) — same hook as Personal
 *   • Sort within each group by name
 *
 * Deferred to S2.x tuning:
 *   • Sort by usage count (most-used first) — needs a project-count
 *     aggregate the v_promotion_candidates view exposes today only for
 *     personal items; an equivalent for studio comes with a follow-up.
 *   • Per-vendor stat row (lifetime value, etc.) — depends on the
 *     vendor-detail context block S3 is building.
 */
export default function StudioLibraryPage() {
  const [view, setView] = useState<ViewMode>('by-vendor');
  const [search, setSearch] = useState('');
  const router = useRouter();
  const { data, isLoading, error } = useLayerProducts({
    layer: 'studio',
    search: search.trim() || undefined,
  });

  const items = data ?? [];

  const grouped = useMemo(() => groupItems(items, view), [items, view]);

  return (
    <div className="flex flex-col gap-5">
      <p className="font-body text-[0.85rem] leading-relaxed text-[var(--text-muted)]">
        Items that have proven out in real projects. Vendor contact stored, lead times documented,
        ready to specify again.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex flex-1 items-center">
          <Search
            className="absolute left-3 h-4 w-4 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search studio library"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
            aria-label="Search studio library"
          />
        </div>

        <div role="tablist" aria-label="View mode" className="flex items-center gap-1">
          <ViewModeTab active={view === 'by-vendor'} onClick={() => setView('by-vendor')}>
            By Vendor
          </ViewModeTab>
          <ViewModeTab active={view === 'by-category'} onClick={() => setView('by-category')}>
            By Category
          </ViewModeTab>
        </div>
      </div>

      {isLoading ? (
        <LoadingStrata />
      ) : error ? (
        <div className="rounded-md border border-[var(--color-error,#C77B6E)] bg-[rgba(199,123,110,0.06)] p-4 text-sm text-[var(--color-error,#C77B6E)]">
          Couldn&apos;t load studio library: {error.message}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Studio Library is empty"
          description="Promote items from your personal library after a piece ships successfully or the vendor relationship matures."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {grouped.map((group) => (
            <section key={group.key} className="flex flex-col gap-3">
              <header className="flex items-baseline gap-3 border-b border-[var(--border-subtle)] pb-1">
                <h3 className="type-item-name">{group.label}</h3>
                <span className="type-meta-small text-[var(--text-muted)]">
                  {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                </span>
              </header>
              <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
                {group.items.map((p) => (
                  <ProductCard
                    key={p.id}
                    id={p.id}
                    name={p.name}
                    imageUrl={p.images?.[0]}
                    price={(p.price_retail ?? 0) / 100}
                    status={p.status ?? undefined}
                    layer="studio"
                    showLayer
                    showUsageCount
                    onClick={(id) => router.push(`/portal/library/studio/${id}`)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ViewModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-[0.78rem] transition-colors"
      style={{
        background: active ? 'var(--accent-primary)' : 'transparent',
        color: active ? 'var(--bg-surface)' : 'var(--text-muted)',
        border: '1px solid var(--border-default)',
        borderColor: active ? 'var(--accent-primary)' : 'var(--border-default)',
      }}
    >
      {children}
    </button>
  );
}

function groupItems(
  items: LayerProductRow[],
  view: ViewMode,
): Array<{ key: string; label: string; items: LayerProductRow[] }> {
  const buckets = new Map<string, LayerProductRow[]>();
  for (const item of items) {
    const key =
      view === 'by-category'
        ? (item.category ?? 'Uncategorized').trim() || 'Uncategorized'
        // studio_id is the most accurate vendor key we have via this hook;
        // when richer vendor metadata is needed the surface should join
        // through use-vendors. For v1 grouping, fall back to "By Vendor"
        // label that uses the brand string captured by the extension.
        : ((item as unknown as { brand?: string | null }).brand ?? 'Unknown vendor').trim() ||
          'Unknown vendor';
    const arr = buckets.get(key) ?? [];
    arr.push(item);
    buckets.set(key, arr);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({
      key,
      label: key,
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
