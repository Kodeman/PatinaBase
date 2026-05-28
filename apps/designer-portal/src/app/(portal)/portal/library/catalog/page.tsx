'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useLayerProducts, type LayerProductRow } from '@patina/supabase';
import { EmptyState, ProductCard } from '@patina/catalog-ui';
import { LoadingStrata } from '@/components/portal/loading-strata';

type CatalogTab = 'browse' | 'for-projects' | 'founding-circle' | 'teach';

const TABS: Array<{ key: CatalogTab; label: string; hint: string }> = [
  { key: 'browse', label: 'Browse', hint: 'Everything in the Patina Catalog.' },
  {
    key: 'for-projects',
    label: 'For your active projects',
    hint: 'Filtered by your in-flight project briefs (Sprint 3 follow-up).',
  },
  {
    key: 'founding-circle',
    label: 'Founding Circle',
    hint: 'Vendors onboarded through the Patina Founding Circle pathway.',
  },
  {
    key: 'teach',
    label: 'Teach the Engine',
    hint: 'Items the Aesthete engine wants more signal on (Sprint 3 follow-up).',
  },
];

/**
 * Catalog LayerView — PRD §5.2 four-tab structure. v1 ships the
 * Browse tab functionally; the other three render guidance copy until
 * their data dependencies land:
 *
 *   For projects     — needs a project-brief → catalog match step that
 *                      depends on the Aesthete engine's project vectors.
 *   Founding Circle  — needs a vendor flag distinguishing Founding
 *                      Circle onboarding from regular nomination-driven
 *                      onboarding (the field exists conceptually; a
 *                      vendors.founding_circle boolean lands with the
 *                      Founding Circle migration when Patina runs it).
 *   Teach the Engine — Aesthete training feedback loop. Out of lane
 *                      until the engine ships.
 *
 * Aesthete-driven sort on Browse defers to a tuning iteration once the
 * engine produces match scores.
 */
export default function CatalogLibraryPage() {
  const [tab, setTab] = useState<CatalogTab>('browse');
  const [search, setSearch] = useState('');
  const router = useRouter();

  const { data, isLoading, error } = useLayerProducts({
    layer: 'catalog',
    search: search.trim() || undefined,
    enabled: tab === 'browse',
  });
  const items = data ?? [];

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

      <ActiveTab
        tab={tab}
        search={search}
        onSearchChange={setSearch}
        items={items}
        isLoading={isLoading}
        error={error}
        onOpen={(id) => router.push(`/portal/catalog/${id}`)}
      />
    </div>
  );
}

function ActiveTab({
  tab,
  search,
  onSearchChange,
  items,
  isLoading,
  error,
  onOpen,
}: {
  tab: CatalogTab;
  search: string;
  onSearchChange: (next: string) => void;
  items: LayerProductRow[];
  isLoading: boolean;
  error: unknown;
  onOpen: (id: string) => void;
}) {
  if (tab !== 'browse') {
    const meta = TABS.find((t) => t.key === tab)!;
    return (
      <EmptyState
        title={meta.label}
        description={`${meta.hint} Coming in a Sprint 3 follow-up — the Browse tab is functional today.`}
      />
    );
  }

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
        <div className="rounded-md border border-[var(--color-error,#C77B6E)] bg-[rgba(199,123,110,0.06)] p-4 text-sm text-[var(--color-error,#C77B6E)]">
          Couldn&apos;t load catalog: {error instanceof Error ? error.message : String(error)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No catalog items match"
          description="Try a different search, or browse the full catalog by clearing the field."
        />
      ) : (
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
      )}
    </div>
  );
}
