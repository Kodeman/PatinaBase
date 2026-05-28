'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useLayerProducts, type LayerProductRow } from '@patina/supabase';
import { EmptyState, ProductCard } from '@patina/catalog-ui';
import { LoadingStrata } from '@/components/portal/loading-strata';
import {
  useForProjectsCatalog,
  useFoundingCircleCatalog,
  useTeachTheEngineCatalog,
} from '@/hooks/use-library-tabs';

type CatalogTab = 'browse' | 'for-projects' | 'founding-circle' | 'teach';

const TABS: Array<{ key: CatalogTab; label: string; hint: string }> = [
  { key: 'browse', label: 'Browse', hint: 'Everything in the Patina Catalog.' },
  {
    key: 'for-projects',
    label: 'For your active projects',
    hint: 'Catalog items matching the categories and styles in your active projects.',
  },
  {
    key: 'founding-circle',
    label: 'Founding Circle',
    hint: 'Vendors onboarded through the Patina Founding Circle pathway.',
  },
  {
    key: 'teach',
    label: 'Teach the Engine',
    hint: 'Items the Aesthete engine wants more signal on.',
  },
];

/**
 * Catalog LayerView — PRD §5.2 four-tab structure. All four tabs read live
 * data where a source exists (PROD-12 / PROD-13):
 *
 *   Browse           — full catalog layer via `useLayerProducts`.
 *   For projects     — heuristic match: catalog products sharing the
 *                      categories/style_tags of products in the designer's
 *                      ACTIVE projects (no Aesthete project-vector source
 *                      exists yet). Honest empty state when there are no
 *                      active projects.
 *   Founding Circle  — intended source is `vendors.founding_circle`, which
 *                      DOES NOT EXIST in the schema. Renders an honest empty
 *                      state flagging the missing column rather than inventing
 *                      it. See `useFoundingCircleCatalog`.
 *   Teach the Engine — catalog products with a `pending` `teaching_queue`
 *                      entry (same source as the teaching hooks).
 *
 * Aesthete-driven sort on Browse defers to a tuning iteration once the
 * engine produces match scores.
 */
export default function CatalogLibraryPage() {
  const [tab, setTab] = useState<CatalogTab>('browse');
  const [search, setSearch] = useState('');
  const router = useRouter();

  const browse = useLayerProducts({
    layer: 'catalog',
    search: search.trim() || undefined,
    enabled: tab === 'browse',
  });

  const forProjects = useForProjectsCatalog(tab === 'for-projects');
  const foundingCircle = useFoundingCircleCatalog(tab === 'founding-circle');
  const teach = useTeachTheEngineCatalog(tab === 'teach');

  const onOpen = (id: string) => router.push(`/portal/catalog/${id}`);

  return (
    <div className="flex flex-col gap-5">
      <p className="font-body text-[0.85rem] leading-relaxed text-[var(--text-muted)]">
        The shared marketplace. One-click ordering, Aesthete-tuned recommendations, makers
        worth keeping. Nominated by designers, onboarded by Patina.
      </p>

      <nav role="tablist" aria-label="Catalog tab" className="flex flex-wrap items-center gap-1">
        {TABS.map((t) => {
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.key)}
              className="rounded-md px-3 py-1.5 text-[0.78rem] transition-colors"
              style={{
                background: isActive ? 'var(--color-clay, #C4A57B)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border-default)',
                borderColor: isActive ? 'var(--color-clay, #C4A57B)' : 'var(--border-default)',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === 'browse' ? (
        <BrowseTab
          search={search}
          onSearchChange={setSearch}
          items={browse.data ?? []}
          isLoading={browse.isLoading}
          error={browse.error}
          onOpen={onOpen}
        />
      ) : tab === 'for-projects' ? (
        forProjects.isLoading ? (
          <LoadingStrata />
        ) : forProjects.error ? (
          <QueryError error={forProjects.error} />
        ) : !forProjects.data?.hasActiveProjects ? (
          <EmptyState
            title="No active projects yet"
            description="Once you have an active project with products specified, we'll surface catalog items that match its categories and styles here."
          />
        ) : forProjects.data.items.length === 0 ? (
          <EmptyState
            title="Nothing to suggest yet"
            description="We couldn't find catalog items matching your active projects' categories and styles. Add more products to your projects to sharpen these suggestions."
          />
        ) : (
          <ProductGrid items={forProjects.data.items} onOpen={onOpen} />
        )
      ) : tab === 'founding-circle' ? (
        foundingCircle.isLoading ? (
          <LoadingStrata />
        ) : foundingCircle.error ? (
          <QueryError error={foundingCircle.error} />
        ) : foundingCircle.data?.missing ? (
          <EmptyState
            title="Founding Circle not yet wired"
            description="This view needs a vendors.founding_circle flag to identify Founding Circle makers. That column doesn't exist in the schema yet — it lands with the Founding Circle vendor migration. Flagging for Patina."
          />
        ) : foundingCircle.data && foundingCircle.data.items.length === 0 ? (
          <EmptyState
            title="No Founding Circle makers yet"
            description="No vendors are flagged into the Founding Circle pathway right now."
          />
        ) : (
          <ProductGrid items={foundingCircle.data?.items ?? []} onOpen={onOpen} />
        )
      ) : /* teach */ teach.isLoading ? (
        <LoadingStrata />
      ) : teach.error ? (
        <QueryError error={teach.error} />
      ) : (teach.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="Nothing needs teaching"
          description="Every catalog item has enough signal for the Aesthete engine right now. Newly captured products will appear here when they need a designer's eye."
        />
      ) : (
        <ProductGrid items={teach.data ?? []} onOpen={onOpen} />
      )}
    </div>
  );
}

function QueryError({ error }: { error: unknown }) {
  return (
    <div className="rounded-md border border-[var(--color-error,#C77B6E)] bg-[rgba(199,123,110,0.06)] p-4 text-sm text-[var(--color-error,#C77B6E)]">
      Couldn&apos;t load catalog: {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

function ProductGrid({
  items,
  onOpen,
}: {
  items: LayerProductRow[];
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
          layer="catalog"
          showLayer
          showAestheteMatch
          onClick={onOpen}
        />
      ))}
    </div>
  );
}

function BrowseTab({
  search,
  onSearchChange,
  items,
  isLoading,
  error,
  onOpen,
}: {
  search: string;
  onSearchChange: (next: string) => void;
  items: LayerProductRow[];
  isLoading: boolean;
  error: unknown;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex items-center">
        <Search
          className="absolute left-3 h-4 w-4 text-[var(--text-muted)]"
          aria-hidden="true"
        />
        <input
          type="search"
          placeholder="Search the Patina Catalog"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
          aria-label="Search the catalog"
        />
      </div>

      {isLoading ? (
        <LoadingStrata />
      ) : error ? (
        <QueryError error={error} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No catalog items match"
          description="Try a different search, or browse the full catalog by clearing the field."
        />
      ) : (
        <ProductGrid items={items} onOpen={onOpen} />
      )}
    </div>
  );
}
