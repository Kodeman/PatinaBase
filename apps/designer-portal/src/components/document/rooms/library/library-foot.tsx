'use client';

/**
 * The Room's quiet foot (R32/R37): teaching compressed to ONE line —
 * "taught today · accuracy · matches sharpened". Present, never gamified: no
 * badges, no daily-goal bars, no streaks.
 *
 * R32's foot reads the DAY (R41 F3): the "Taught today" count is a date-filtered
 * read over the real teaching write (useDesignerTaughtToday → product_styles),
 * resetting daily. Accuracy and matches-sharpened stay lifetime quality measures
 * from designer_teaching_stats (they are running scores, not daily counts).
 */

import { useDesignerTeachingStats, useDesignerTaughtToday } from '@patina/supabase';

interface TeachingStats {
  products_taught: number;
  accuracy_score: number;
  match_impact_count: number;
}

export function LibraryFoot() {
  const { data, isLoading } = useDesignerTeachingStats();
  const { data: taughtTodayCount, isLoading: loadingToday } = useDesignerTaughtToday();
  const stats = (data ?? null) as TeachingStats | null;

  // Real-or-nothing (R32/R37): show "—" while a read is in flight rather than
  // flashing a fabricated 0 that reads as a truthful zero.
  const taughtToday = loadingToday ? null : (taughtTodayCount ?? 0);
  const impact = isLoading ? null : (stats?.match_impact_count ?? 0);
  const acc =
    isLoading || stats == null || stats.accuracy_score === 0
      ? null
      : stats.accuracy_score <= 1
        ? Math.round(stats.accuracy_score * 100)
        : Math.round(stats.accuracy_score);

  return (
    <div className="mx-auto mt-10 flex max-w-[1240px] flex-wrap items-center gap-x-8 gap-y-3 border-t border-[var(--doc-ink-border)] px-6 pt-5 sm:px-9">
      <FootStat value={taughtToday == null ? '—' : String(taughtToday)} label="Taught today" />
      <FootStat value={acc == null ? '—' : `${acc}%`} label="Your accuracy" />
      <FootStat value={impact == null ? '—' : String(impact)} label="Matches sharpened" />
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
