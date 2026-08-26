'use client';

/**
 * The Finalize table's one row — the client's copy, as the client is reading
 * it (Start to Signature W4a, flag `worktable`).
 *
 * `The client's copy` is the TICKET's ninth row now (B2), and the ticket is
 * where a proposal document reaches it once the ticket mounts on the proposal
 * spread. Until then this row is how it stays reachable, so no proposal on the
 * Finalize table is ever without its copy. It is one row, not a block: the
 * spine's shelves block is deleted, and heading a group of one `The shelves`
 * named a shelf-full the proposal never had.
 *
 * The row and its leaf exist only from 1440px by the panel's own construction;
 * below that the watch's Preview act is the copy's form (Q7/A4).
 */

import {
  SHELF_LEAF_ID,
  shelfDefinition,
  type ShelfKey,
} from '@/lib/document/shelves';

const CLIENT_COPY = shelfDefinition('clientcopy');

/** The row's own state line, as the shelf block printed it. */
const STATUS = 'As sent · live';

export function FinalizeShelf({
  openShelf,
  onToggleShelf,
}: {
  openShelf: ShelfKey | null;
  onToggleShelf: (key: ShelfKey) => void;
}) {
  const open = openShelf === CLIENT_COPY.key;
  return (
    <div className="mt-4 border-t border-[var(--color-pearl)] pt-3">
      <button
        type="button"
        data-shelf-trigger={CLIENT_COPY.key}
        aria-expanded={open}
        // Only while the leaf is mounted: a closed leaf renders nothing, and
        // aria-controls pointing at an id that is not in the document offers a
        // jump into a void.
        {...(open ? { 'aria-controls': SHELF_LEAF_ID } : {})}
        onClick={() => onToggleShelf(CLIENT_COPY.key)}
        className={`-mx-1.5 flex w-[calc(100%+0.75rem)] items-center justify-between gap-2 px-1.5 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
          open ? 'doc-room-lifted' : 'border-b border-[rgba(44,41,38,0.10)]'
        }`}
      >
        <span className="min-w-0">
          <span
            className={`block text-[13.5px] leading-tight text-[var(--color-charcoal)] ${
              open ? 'font-semibold' : ''
            }`}
          >
            {CLIENT_COPY.title}
          </span>
          <span
            className={`mt-px block font-mono text-[10px] uppercase tracking-[0.07em] ${
              open
                ? 'text-[var(--color-charcoal)]'
                : 'text-[var(--color-aged-oak)]'
            }`}
          >
            {STATUS}
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
    </div>
  );
}
