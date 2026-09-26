'use client';

/**
 * The collapsed "Since you were last here" line (system-architecture §5,
 * ux-options §E, mockup 03). One line that discloses at most three release
 * headlines, with no count and no dates, and the one link to What changed.
 * Set type, not a widget: the disclosure is a plain `<button aria-expanded
 * aria-controls>` and nothing takes focus on arrival.
 */

import { useId, useState } from 'react';
import Link from 'next/link';

export interface SinceLineItem {
  id: string;
  headline: string;
}

export interface SinceLineProps {
  items: readonly SinceLineItem[];
  changesHref: string;
}

const MAX_ITEMS = 3;

export function SinceLine({ items, changesHref }: SinceLineProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <aside role="note" className="max-w-[34ch]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.11em] text-[var(--text-faint)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
      >
        Since you were last here
      </button>
      <div id={listId} hidden={!open}>
        <ul className="m-0 list-none p-0">
          {items.slice(0, MAX_ITEMS).map((item) => (
            <li
              key={item.id}
              className="mb-1.5 font-heading text-[15px] italic leading-[1.55] text-[var(--text-body)]"
            >
              <span aria-hidden className="mr-1 not-italic text-[var(--text-muted)]">
                –
              </span>
              {item.headline}
            </li>
          ))}
        </ul>
        <Link
          href={changesHref}
          className="inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-clay-ink)] underline decoration-[var(--color-aged-oak)] underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
        >
          What changed
        </Link>
      </div>
    </aside>
  );
}
