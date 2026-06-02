'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCrossLayerSearch, type LayerProductRow } from '@patina/supabase';
import { LayerChip, ProductCard, EmptyState, type Layer } from '@patina/catalog-ui';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';

const LAYER_ORDER: Layer[] = ['personal', 'studio', 'catalog'];

const LAYER_LABEL: Record<Layer, string> = {
  personal: 'Personal Library',
  studio: 'Studio Library',
  catalog: 'Patina Catalog',
};

/**
 * Cross-layer search results page (PRD §10.2 surface — single search input
 * spans all three layers and renders grouped results). Reached from the
 * search input in the ProductsZone layout; URL carries `q` so results are
 * shareable / refresh-stable.
 */
export default function LibrarySearchPage() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params?.get('q') ?? '';
  const hydrated = useHydrated();
  const { data, isLoading, error } = useCrossLayerSearch({ query });

  if (!query.trim()) {
    return (
      <EmptyState
        title="Search across all layers"
        description="Type a product name or brand in the search box above to find anything you've captured, your studio has saved, or Patina has in the catalog."
      />
    );
  }

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) {
    return <LoadingStrata />;
  }

  if (error) {
    return (
      <div className="rounded-md border border-[var(--color-error,#C77B6E)] bg-[rgba(199,123,110,0.06)] p-4 text-sm text-[var(--color-error,#C77B6E)]">
        Couldn&apos;t run search: {error.message}
      </div>
    );
  }

  const result = data ?? {
    byLayer: { personal: [], studio: [], catalog: [] },
    counts: { personal: 0, studio: 0, catalog: 0 },
    total: 0,
  };

  if (result.total === 0) {
    return (
      <EmptyState
        title={`No matches for "${query}"`}
        description="Try a different term, or browse a layer directly from the tabs above."
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="font-body text-[0.85rem] text-[var(--text-muted)]">
        {result.total} result{result.total === 1 ? '' : 's'} for{' '}
        <span className="text-[var(--text-primary)]">&ldquo;{query}&rdquo;</span>
      </p>

      {LAYER_ORDER.map((layer) => {
        const items = result.byLayer[layer];
        if (items.length === 0) return null;

        return (
          <section key={layer} className="flex flex-col gap-4">
            <header className="flex items-center gap-3">
              <LayerChip layer={layer} size="md" />
              <span className="type-meta-small text-[var(--text-muted)]">
                {items.length} {items.length === 1 ? 'match' : 'matches'} in{' '}
                {LAYER_LABEL[layer]}
              </span>
            </header>
            <SearchGrid
              items={items}
              layer={layer}
              onOpen={(id) => router.push(`/portal/catalog/${id}`)}
            />
          </section>
        );
      })}
    </div>
  );
}

function SearchGrid({
  items,
  layer,
  onOpen,
}: {
  items: LayerProductRow[];
  layer: Layer;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <ProductCard
          key={p.id}
          id={p.id}
          name={p.name}
          imageUrl={p.images?.[0]}
          price={(p.price_retail ?? 0) / 100}
          status={p.status ?? undefined}
          layer={layer}
          showLayer
          onClick={onOpen}
        />
      ))}
    </div>
  );
}
