'use client';

/**
 * The shelves, in the spine. Four rows open a leaf beside the rail; the call
 * sheet row is a doorway to the roster sheet that already exists, so it
 * declares no expansion — it opens something else, and saying `aria-expanded`
 * on it would promise a panel that never appears here.
 */

import { SHELVES, type ShelfKey } from '@/lib/document/shelves';

export const SHELF_LEAF_ID = 'doc-shelf-leaf';

export function SpineShelvesBlock({
  openShelf,
  statuses,
  onToggleShelf,
}: {
  openShelf: ShelfKey | null;
  statuses: Record<ShelfKey, string>;
  onToggleShelf: (key: ShelfKey) => void;
}) {
  return (
    <div className="mt-4 border-t border-[var(--color-pearl)] pt-3">
      <p
        id="doc-spine-shelves-label"
        className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]"
      >
        The shelves
      </p>
      <div role="group" aria-labelledby="doc-spine-shelves-label">
        {SHELVES.map((shelf) => {
          const open = shelf.kind === 'leaf' && openShelf === shelf.key;
          return (
            <button
              key={shelf.key}
              type="button"
              data-shelf-trigger={shelf.key}
              {...(shelf.kind === 'leaf'
                ? { 'aria-expanded': open, 'aria-controls': SHELF_LEAF_ID }
                : {})}
              onClick={() => onToggleShelf(shelf.key)}
              className={`-mx-1.5 flex w-[calc(100%+0.75rem)] items-center justify-between gap-2 px-1.5 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
                open
                  ? 'doc-room-lifted'
                  : 'border-b border-[rgba(44,41,38,0.10)]'
              }`}
            >
              <span className="min-w-0">
                <span
                  className={`block text-[13.5px] leading-tight ${
                    open
                      ? 'font-semibold text-[var(--color-charcoal)]'
                      : 'text-[var(--color-charcoal)]'
                  }`}
                >
                  {shelf.title}
                </span>
                <span
                  className={`mt-px block font-mono text-[10px] uppercase tracking-[0.07em] ${
                    open
                      ? 'text-[var(--color-charcoal)]'
                      : 'text-[var(--color-aged-oak)]'
                  }`}
                >
                  {statuses[shelf.key]}
                </span>
              </span>
              <span
                aria-hidden
                className={`font-mono text-[11px] ${
                  open
                    ? 'text-[var(--color-charcoal)]'
                    : 'text-[var(--color-aged-oak)]'
                }`}
              >
                →
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
