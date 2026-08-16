'use client';

/**
 * A future seam — a domain this document will have, printed honestly before it
 * has one (Q6: no fake affordances at Intake).
 *
 * The visual idiom is the settled bar's: the same letterhead row, the name in
 * heading italic, the state in mono. What it is NOT is a control — there is no
 * body to unfold and no act to offer, so unlike `SettledBar` and `FoldSeam`
 * this is a plain element that can only be focused, so a keyboard reader can
 * still reach and read the line.
 */

import { DOCUMENT_INDEX_LABELS } from '@/lib/document/document-index';

export function FutureSeam({ name, opens }: { name: string; opens: string }) {
  return (
    <div
      data-future-seam
      tabIndex={0}
      className="mb-2 flex min-h-11 w-full items-center justify-between gap-3 rounded-[5px] border border-dashed border-[var(--color-pearl)] px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
    >
      <span className="font-heading text-[13px] font-medium italic text-[var(--text-muted)]">
        {name}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
        {opens}
      </span>
    </div>
  );
}

/**
 * The three downstream domains an intake document does not have yet, named out
 * of the running index so a seam and the index cannot call one region two
 * things. Client approvals is deliberately absent: it opens with the project
 * like the other two, and four seams under a lead record is a list, not a
 * horizon.
 */
export function IntakeFutureSeams() {
  return (
    <div className="mt-6">
      <FutureSeam
        name={DOCUMENT_INDEX_LABELS.schedule}
        opens="Opens when the project begins"
      />
      <FutureSeam name={DOCUMENT_INDEX_LABELS.ffe} opens="Opens with the Direction" />
      <FutureSeam
        name={DOCUMENT_INDEX_LABELS.money}
        opens="Opens when the project begins"
      />
    </div>
  );
}
