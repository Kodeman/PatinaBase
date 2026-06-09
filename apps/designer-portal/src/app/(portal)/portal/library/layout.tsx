'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';

/**
 * Library shell — page header + cross-layer search above the per-layer views.
 *
 * The three-layer picker (My Library / Studio Library / Patina Catalog) used to
 * live here; it now renders in the global sub-nav row for the Products zone
 * (see components/portal/library-layer-nav.tsx). This layout keeps the page
 * title and the cross-layer search box.
 *
 * The S3.12 pilot gate was removed on 2026-06-09 — the three-layer Library is
 * now the Products experience for every org.
 */
export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isSearchRoute = pathname === '/portal/library/search';
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

      <div>{children}</div>
    </div>
  );
}
