'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { useLayerCounts } from '@patina/supabase';
import { LayerIcon, type Layer } from '@patina/catalog-ui';

interface TabDef {
  key: Layer;
  label: string;
  href: string;
}

const TABS: TabDef[] = [
  { key: 'personal', label: 'My Library', href: '/portal/library/personal' },
  { key: 'studio', label: 'Studio Library', href: '/portal/library/studio' },
  { key: 'catalog', label: 'Patina Catalog', href: '/portal/library/catalog' },
];

/**
 * ProductsZone shell — the three-tab navigation framing the Personal /
 * Studio / Catalog layer views. Visual spec from
 * `docs/prds/patina-three-layer-product-catalog.html` §Navigation and PRD
 * engineering handoff §5.2.
 *
 * v1 lives at `/portal/library` alongside the existing single-tier
 * `/portal/catalog`. The rename + redirect cuts over after Sprint 3 pilot
 * (see plan §"Files NOT modified").
 */
export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: counts } = useLayerCounts();

  const isSearchRoute = pathname === '/portal/library/search';
  const activeTab = isSearchRoute
    ? undefined
    : (TABS.find((tab) => pathname?.startsWith(tab.href))?.key ?? 'personal');
  const initialQuery = isSearchRoute ? searchParams?.get('q') ?? '' : '';
  const [searchValue, setSearchValue] = useState(initialQuery);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = searchValue.trim();
    if (trimmed.length === 0) return;
    router.push(`/portal/library/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="type-section-head text-[var(--text-primary)]">Library</h1>
            <p className="font-body text-[0.85rem] leading-relaxed text-[var(--text-muted)]">
              Capture what you find. Promote what proves out. Nominate the makers worth keeping.
            </p>
          </div>
          <form onSubmit={submitSearch} role="search" className="w-full max-w-sm md:w-80">
            <label htmlFor="library-cross-search" className="sr-only">
              Search across all layers
            </label>
            <div className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <input
                id="library-cross-search"
                type="search"
                placeholder="Search across all layers"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
              />
            </div>
          </form>
        </div>
      </header>

      <nav
        role="tablist"
        aria-label="Library layer"
        className="flex items-center gap-1 border-b border-[var(--border-default)]"
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          const count = counts?.[tab.key];
          return (
            <Link
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              href={tab.href}
              className="group flex items-center gap-2 px-4 py-3 transition-colors"
              style={{
                borderBottom: isActive
                  ? '2px solid var(--accent-primary)'
                  : '2px solid transparent',
                marginBottom: -1, // overlap parent border
              }}
            >
              <LayerIcon layer={tab.key} size="sm" />
              <span
                className="font-body text-[0.88rem]"
                style={{
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                {tab.label}
              </span>
              {typeof count === 'number' && (
                <span
                  className="type-meta-small"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label={`${count} items`}
                >
                  · {count.toLocaleString()}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}
