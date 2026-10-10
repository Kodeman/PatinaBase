'use client';

/**
 * The Room's quiet foot (R32/R37). US-25 fix-now 9: the teaching counters
 * (taught today · accuracy · matches sharpened · pairs weighed) are gone. A
 * studio surface is never scored (BRIEF §2), so the foot keeps its one line
 * and no number.
 */

export function LibraryFoot() {
  return (
    <div className="mx-auto mt-10 flex max-w-[1240px] flex-wrap items-center gap-x-8 gap-y-3 border-t border-[var(--doc-ink-border)] px-6 pt-5 sm:px-9">
      <p className="ml-auto max-w-[32ch] text-right text-[0.66rem] italic text-[var(--color-aged-oak)]">
        The shelves are your eye, made legible to the Engine.
      </p>
    </div>
  );
}
