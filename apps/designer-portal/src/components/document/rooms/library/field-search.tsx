'use client';

/**
 * Exact shelf matches for the Library omnibox (R88). Query ownership remains
 * here: useCrossLayerSearch reads name, SKU, maker, and category across all
 * three layers. The visible input lives in LibrarianBar so finding and asking
 * begin with one honest control.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useCrossLayerSearch, type LayerProductRow } from '@patina/supabase';
import { StrataSweep } from '@/components/ui/strata-sweep';

const LAYER_NOTE: Record<string, string> = {
  personal: 'My Library',
  studio: 'Studio',
  catalog: 'Patina Catalog',
};
const LAYER_ORDER: Array<'personal' | 'studio' | 'catalog'> = [
  'personal',
  'studio',
  'catalog',
];

export function FieldSearch({ query }: { query: string }) {
  const [debounced, setDebounced] = useState('');

  // Preserve the quiet debounce, but clear immediately so stale matches do not
  // linger after the single omnibox is emptied.
  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setDebounced('');
      return;
    }
    const timer = window.setTimeout(() => setDebounced(normalized), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data, isLoading, isError } = useCrossLayerSearch({
    query: debounced,
  });

  const active = debounced.length > 0;
  const groups = useMemo(() => {
    if (!data) {
      return [] as Array<{
        layer: 'personal' | 'studio' | 'catalog';
        rows: LayerProductRow[];
      }>;
    }
    return LAYER_ORDER.map((layer) => ({
      layer,
      rows: data.byLayer[layer],
    })).filter((group) => group.rows.length > 0);
  }, [data]);

  if (!active) return null;

  return (
    <section
      aria-labelledby="library-exact-results"
      aria-busy={isLoading}
      aria-live="polite"
      data-library-exact-results
      className="mx-auto mt-5 max-w-[680px] text-left"
    >
      <h2
        id="library-exact-results"
        className="font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)]"
      >
        Exact shelf matches
      </h2>

      {isLoading && (
        <div className="flex items-center gap-2 py-3">
          <StrataSweep size="sm" label="Searching the shelves" />
          <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
            Looking…
          </span>
        </div>
      )}

      {isError && (
        <p className="py-3 text-[14px] italic text-[var(--color-charcoal)]">
          The shelves could not be searched just now.
        </p>
      )}

      {!isLoading && !isError && groups.length === 0 && (
        <p className="py-3 font-heading text-[14px] italic text-[var(--color-charcoal)]">
          Nothing on the shelves matches &ldquo;{debounced}&rdquo;.
        </p>
      )}

      {!isLoading &&
        !isError &&
        groups.map((group) => (
          <div key={group.layer} className="mt-3">
            <div className="mb-1 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
              {LAYER_NOTE[group.layer]} · {group.rows.length}
            </div>
            <ul className="space-y-1.5">
              {group.rows.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/library/${row.id}`}
                    className="group flex min-h-11 items-center gap-3 rounded-[5px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-2.5 py-2 transition-colors hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-[var(--doc-sheet-2)]">
                      {row.images?.[0] ? (
                        <img
                          src={row.images[0]}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
                          {row.category ?? 'Piece'}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-[var(--color-charcoal)]">
                        {row.name}
                      </span>
                      <span className="block truncate font-mono text-[12px] uppercase tracking-[0.05em] text-[var(--text-body)]">
                        {[row.brand, row.category].filter(Boolean).join(' · ') ||
                          'Unknown maker'}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="shrink-0 font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--color-charcoal)]"
                    >
                      Open →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}
