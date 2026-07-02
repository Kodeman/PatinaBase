'use client';

/**
 * The Makers marketplace lens (R78 / PRC-01 / PRC-04) — discovery INSIDE the
 * Directory's Makers filter, never a new route. The roster shows the makers
 * you've admitted; this lens turns the same page over to EVERY maker in the
 * book (`useVendors`), with a quiet search and a DM-mono category line —
 * typography-first, no FilterPill chrome, zero shadows (D4).
 *
 * Save = admission (R78): a saved maker joins `people_directory` (00221) and
 * thereby the roster. Rows carry the save act when unsaved and a quiet
 * "on your roster" stamp when saved; unsave lives on the profile, not here —
 * the marketplace only ever admits.
 */

import { useMemo, useState } from 'react';
import {
  useSavedVendorIds,
  useToggleVendorSave,
  useVendors,
} from '@patina/supabase';
import { Avatar } from '../person-bits';

// The vendors hook predates generated types for this table (see use-vendors.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyVendor = any;

const MONO_LINK = 'font-mono text-[9.5px] uppercase tracking-[0.1em] transition-colors';

/** Humanize a stored category token ("case_goods" → "case goods"). */
const cat = (raw: unknown): string => String(raw ?? '').replace(/_/g, ' ').trim();

export function MakersMarketplace({
  onOpenMaker,
}: {
  /** Open the role-adaptive maker profile (works pre-admission too). */
  onOpenMaker: (vendorId: string) => void;
}) {
  // The whole book, once — the marketplace is a book to leaf through, not a
  // feed (same read the Orders ledger takes). Search + category narrow it
  // in memory, the way the directory's own search works.
  const { data: vendorsPage, isLoading } = useVendors(undefined, { page: 1, pageSize: 200 }) as {
    data: { data: AnyVendor[] } | undefined;
    isLoading: boolean;
  };
  const vendors = useMemo(() => vendorsPage?.data ?? [], [vendorsPage]);

  const { data: savedIds } = useSavedVendorIds();
  const saved = useMemo(() => new Set(savedIds ?? []), [savedIds]);

  const toggleSave = useToggleVendorSave({ errorSurface: 'inline' });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  // The category line derives from the book itself — the makers name their
  // own shelves.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const v of vendors) {
      const c = cat(v.primary_category);
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [vendors]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors
      .filter((v) => {
        if (category && cat(v.primary_category) !== category) return false;
        if (!q) return true;
        return (
          String(v.name ?? '').toLowerCase().includes(q) ||
          String(v.trade_name ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
  }, [vendors, search, category]);

  const admit = async (vendor: AnyVendor) => {
    // The act only renders on UNSAVED rows, so the toggle always saves here.
    setRowError(null);
    setSavingId(vendor.id);
    try {
      await toggleSave.mutateAsync({ vendorId: vendor.id });
    } catch (e) {
      setRowError({
        id: vendor.id,
        text: e instanceof Error ? e.message : 'Could not save them just now — try again.',
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      {/* The quiet search — an underline, not a control. */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search every maker…"
        aria-label="Search the marketplace"
        className="mb-3 w-full border-0 border-b border-[var(--color-pearl)] bg-transparent px-0.5 py-1.5 text-[0.82rem] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--color-aged-oak)] focus:border-[var(--color-clay)]"
      />

      {/* The category line — DM-mono words, never pills. */}
      {categories.length > 0 && (
        <p className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={() => setCategory(null)}
            aria-current={category === null ? 'true' : undefined}
            className={`${MONO_LINK} ${
              category === null
                ? 'text-[var(--color-clay)]'
                : 'text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]'
            }`}
          >
            everything
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory((prev) => (prev === c ? null : c))}
              aria-current={category === c ? 'true' : undefined}
              className={`${MONO_LINK} ${
                category === c
                  ? 'text-[var(--color-clay)]'
                  : 'text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]'
              }`}
            >
              {c}
            </button>
          ))}
        </p>
      )}

      {isLoading ? (
        <p className="px-1 py-6 text-[0.76rem] text-[var(--color-aged-oak)]">
          Opening the marketplace…
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--doc-ink-border)] bg-white/40 px-5 py-8 text-center">
          <p className="text-[0.76rem] leading-relaxed text-[var(--color-aged-oak)]">
            {vendors.length === 0
              ? 'The marketplace is empty — makers appear here as they join Patina.'
              : 'No makers match that. Loosen the search or the category.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((v) => {
            const isSaved = saved.has(v.id);
            const line = [
              cat(v.primary_category) || null,
              v.market_position ? String(v.market_position).replace(/-/g, ' ') : null,
              typeof v.designer_rating_avg === 'number' && v.designer_rating_avg > 0
                ? `${Number(v.designer_rating_avg).toFixed(1)}★`
                : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={v.id}>
                <div className="flex w-full items-center gap-3.5 rounded-[10px] border border-[var(--color-pearl)] bg-white px-3.5 py-3 transition-[border-color,transform] duration-200 hover:-translate-y-[2px] hover:border-[var(--color-clay)]">
                  <button
                    type="button"
                    onClick={() => onOpenMaker(v.id)}
                    className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
                  >
                    <Avatar name={String(v.name ?? 'Maker')} role="maker" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.92rem] font-semibold text-[var(--color-charcoal)]">
                        {v.name}
                      </span>
                      <span className="mt-[0.15rem] block truncate text-[0.7rem] text-[var(--color-aged-oak)]">
                        {line || 'Maker'}
                      </span>
                      {rowError !== null && rowError.id === v.id && (
                        <span className="mt-[0.15rem] block font-mono text-[0.52rem] uppercase tracking-[0.06em] text-[var(--color-terracotta)]">
                          {rowError.text}
                        </span>
                      )}
                    </span>
                  </button>
                  {isSaved ? (
                    // The quiet admission stamp — unsave lives on the profile.
                    <span className="shrink-0 border border-[var(--color-sage)] px-2 py-[3px] font-mono text-[0.46rem] font-semibold uppercase tracking-[0.08em] text-[#6f8268]">
                      On your roster
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={savingId === v.id}
                      onClick={() => void admit(v)}
                      className="shrink-0 whitespace-nowrap font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-clay)] transition-colors hover:text-[var(--color-aged-oak)] disabled:opacity-40"
                    >
                      {savingId === v.id ? 'saving…' : 'save →'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
