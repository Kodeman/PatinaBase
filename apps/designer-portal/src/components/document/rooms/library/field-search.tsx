'use client';

/**
 * Field-grain search (R88) — the exact-find companion to the librarian's
 * semantic ask. Where the Engine ask reads meaning across your shelves, this
 * looks up a piece you already know by name, SKU, maker, or category. A quiet
 * DM-mono line, distinct from the Engine's Playfair hero. Results are shelf
 * result-lines in Library grammar (R32/R39), each opening the piece — no
 * "Place" act; finding is not placing.
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
const LAYER_ORDER: Array<'personal' | 'studio' | 'catalog'> = ['personal', 'studio', 'catalog'];

export function FieldSearch() {
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');

  // Quiet debounce so a fast typist doesn't fire a query per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value.trim()), 220);
    return () => window.clearTimeout(t);
  }, [value]);

  const { data, isLoading, isError } = useCrossLayerSearch({
    query: debounced,
    // name · SKU · maker(brand) · category — the field-grain default.
  });

  const active = debounced.length > 0;
  const groups = useMemo(() => {
    if (!data) return [] as Array<{ layer: 'personal' | 'studio' | 'catalog'; rows: LayerProductRow[] }>;
    return LAYER_ORDER.map((layer) => ({ layer, rows: data.byLayer[layer] })).filter(
      (g) => g.rows.length > 0,
    );
  }, [data]);

  return (
    <div className="mx-auto mt-4 max-w-[580px] px-6 sm:px-9">
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-[var(--color-aged-oak)]"
        >
          ⌕
        </span>
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Find a piece by name, SKU, maker, or category"
          placeholder="Find by name, SKU, maker, or category…"
          className="w-full rounded-[7px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] py-2 pl-8 pr-8 font-mono text-[0.74rem] tracking-[0.01em] text-[var(--color-charcoal)] placeholder:text-[var(--color-aged-oak)] placeholder:opacity-70 focus:border-[var(--color-clay)] focus:bg-white focus:outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => setValue('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]"
          >
            ✕
          </button>
        )}
      </div>

      {active && (
        <div className="mt-2 text-left">
          {isLoading && (
            <div className="flex items-center gap-2 py-3">
              <StrataSweep size="sm" label="Searching the shelves" />
              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] opacity-70">
                looking…
              </span>
            </div>
          )}

          {isError && (
            <p className="py-3 text-[12px] italic text-[var(--text-muted)]">
              The shelves could not be searched just now.
            </p>
          )}

          {!isLoading && !isError && groups.length === 0 && (
            <p className="py-3 font-heading text-[13px] italic text-[var(--text-muted)]">
              Nothing on the shelves matches &ldquo;{debounced}&rdquo;.
            </p>
          )}

          {!isLoading &&
            !isError &&
            groups.map((group) => (
              <div key={group.layer} className="mb-2">
                <div className="mb-1 mt-1 font-mono text-[8px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
                  {LAYER_NOTE[group.layer]} · {group.rows.length}
                </div>
                <ul className="space-y-1">
                  {group.rows.map((row) => (
                    <li key={row.id}>
                      <Link
                        href={`/library/${row.id}`}
                        className="flex items-center gap-3 rounded-[6px] border border-[var(--doc-ink-border)] bg-white px-2.5 py-1.5 transition-colors hover:border-[var(--color-clay)]"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-[var(--doc-sheet-2)]">
                          {row.images?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={row.images[0]}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="font-mono text-[7px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] opacity-50">
                              {row.category ?? 'piece'}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium text-[var(--color-charcoal)]">
                            {row.name}
                          </span>
                          <span className="block truncate font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
                            {[row.brand, row.category].filter(Boolean).join(' · ') || 'unknown maker'}
                          </span>
                        </span>
                        <span
                          aria-hidden
                          className="shrink-0 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-clay)]"
                        >
                          Open →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
