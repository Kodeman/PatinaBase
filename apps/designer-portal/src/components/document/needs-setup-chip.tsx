'use client';

/**
 * The needs-setup chip (Wave 4 · W1) — one dashed line beside the letterhead
 * vitals in place of the machine strings the review found shouting there.
 *
 * Each entry carries its own remedy, so the count is a door rather than a
 * complaint. The chip states nothing at all when there is nothing to set up:
 * a "0" would be a complaint about the absence of a complaint.
 */

import { useId, useState } from 'react';

export interface NeedsSetupEntry {
  /** The need as the Desk composed it — already actor-neutral. */
  text: string;
  remedyLabel: string;
  onActivate: () => void;
}

export function NeedsSetupChip({
  count,
  entries,
}: {
  count: number;
  entries: NeedsSetupEntry[];
}) {
  const [open, setOpen] = useState(false);
  const contentId = `needs-setup-${useId().replace(/:/g, '')}`;
  if (count === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-baseline gap-1 border border-dashed border-[var(--color-aged-oak)] px-2 py-1 font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--color-aged-oak)] hover:text-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
      >
        <span>Needs setup · {count}</span>
        <span aria-hidden>→</span>
      </button>
      <ul id={contentId} hidden={!open} className="mt-1.5 space-y-1">
        {open
          ? entries.map((entry) => (
              <li key={entry.text} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[11px] text-[var(--color-charcoal)]">{entry.text}</span>
                <button
                  type="button"
                  onClick={entry.onActivate}
                  className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-clay)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
                >
                  {entry.remedyLabel}
                </button>
              </li>
            ))
          : null}
      </ul>
    </div>
  );
}
