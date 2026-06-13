'use client';

/**
 * The Room's quiet foot (R32/R37): teaching compressed to ONE line —
 * "taught · accuracy · matches sharpened". Present, never gamified: no badges,
 * no daily-goal bars, no streaks. Reads the real designer_teaching_stats.
 *
 * Note: the stats view carries lifetime totals, not a per-day cut, so the line
 * reads "taught" (lifetime), not "taught today" — labelled honestly until a
 * daily view exists (flagged in the Track-3 I-entry).
 */

import { useDesignerTeachingStats } from '@patina/supabase';

interface TeachingStats {
  products_taught: number;
  accuracy_score: number;
  match_impact_count: number;
}

export function LibraryFoot() {
  const { data } = useDesignerTeachingStats();
  const stats = (data ?? null) as TeachingStats | null;

  const taught = stats?.products_taught ?? 0;
  const impact = stats?.match_impact_count ?? 0;
  const acc =
    stats == null || stats.accuracy_score === 0
      ? null
      : stats.accuracy_score <= 1
        ? Math.round(stats.accuracy_score * 100)
        : Math.round(stats.accuracy_score);

  return (
    <div className="mx-auto mt-10 flex max-w-[1240px] flex-wrap items-center gap-x-8 gap-y-3 border-t border-[var(--doc-ink-border)] px-6 pt-5 sm:px-9">
      <FootStat value={String(taught)} label="Taught" />
      <FootStat value={acc == null ? '—' : `${acc}%`} label="Your accuracy" />
      <FootStat value={String(impact)} label="Matches sharpened" />
      <p className="ml-auto max-w-[32ch] text-right text-[0.66rem] italic text-[var(--color-aged-oak)]">
        The shelves are your eye, made legible to the Engine.
      </p>
    </div>
  );
}

function FootStat({ value, label }: { value: string; label: string }) {
  return (
    <span className="font-mono">
      <span className="font-heading text-[1rem] not-italic text-[var(--color-charcoal)]">
        {value}
      </span>
      <span className="mt-px block font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
        {label}
      </span>
    </span>
  );
}
