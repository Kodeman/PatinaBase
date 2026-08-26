'use client';

/**
 * The leaf — one shelf, pulled out beside the spine. A single panel that swaps
 * its contents; one shelf is open at a time, because a shelf that stacks is a
 * pile.
 *
 * From 1440px it is that 320px aside. Below 1440px there is no room for it, so
 * a shelf that has a page of its own resolves to that page instead of opening
 * an aside nobody can see (`shelfRouteFor`) — which is what lets the shelves
 * be reachable at every width, and what replaces the force-close a resize used
 * to perform. A shelf with no page (the client's copy) keeps the ≥1440 leaf it
 * has always had.
 *
 * It is a `region`, not a `dialog`: the paper behind it stays live and
 * scrollable (D1 — no split views, but no modal reference material either), and
 * it must not claim the aria contract a DocSheet keeps. Esc puts the leaf away,
 * but only when no sheet is open over it — a sheet raised FROM a leaf owns Esc
 * first, and the page's Esc→put-down stands down while either is up.
 *
 * z-[45]: above the pinned schedule glance (z-[3]) and the doc spine (z-[2]),
 * below DocSheet (z-50), which must still win over an open leaf.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  CLOSE_SHELF_EVENT,
  shelfDefinition,
  shelfRouteFor,
  SHELF_LEAF_ID,
  type ShelfLeafKey,
} from '@/lib/document/shelves';

/** Re-exported at the leaf, because a caller deciding between the leaf and the
 *  route asks the leaf for both. */
export { shelfRouteFor };

/** The width at which the paper can still spare 320px beside the spine. */
const FULL_TIER = '(min-width: 1440px)';

/** Assumed true until the browser says otherwise, so the server and the first
 *  client render agree. Below 1440 the aside is display:none anyway. */
function useFullTier(): boolean {
  const [full, setFull] = useState(true);
  useEffect(() => {
    const query = window.matchMedia?.(FULL_TIER);
    if (!query) return;
    const sync = () => setFull(query.matches);
    sync();
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);
  return full;
}

/** A field, a picker, or rich text — anything Esc already means something to. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function ShelfPanel({
  openShelf,
  onClose,
  projectId,
  children,
}: {
  openShelf: ShelfLeafKey | null;
  onClose: () => void;
  /** Which document's shelves these are. Without it a routing shelf can only
   *  be put away below 1440, not travelled to. */
  projectId?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const fullTier = useFullTier();
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<ShelfLeafKey | null>(null);
  const route =
    openShelf && projectId ? shelfRouteFor(openShelf, projectId) : null;
  const routes = openShelf
    ? shelfDefinition(openShelf).routeSegment !== null
    : false;

  // A shelf carried below 1440 — opened at the full tier and then resized —
  // goes to its own page rather than staying open behind a display:none aside.
  useEffect(() => {
    if (!openShelf || fullTier || !routes) return;
    if (route) router.push(route);
    onClose();
  }, [openShelf, fullTier, routes, route, router, onClose]);

  useEffect(() => {
    if (!openShelf) return;
    closeRef.current?.focus();
  }, [openShelf]);

  // Focus goes back where it came from. The trigger lives in the spine and
  // names itself, so the leaf does not have to be handed a ref through the page.
  useEffect(() => {
    const previous = openRef.current;
    openRef.current = openShelf;
    if (openShelf || !previous) return;
    document
      .querySelector<HTMLElement>(`[data-shelf-trigger="${previous}"]`)
      ?.focus();
  }, [openShelf]);

  useEffect(() => {
    if (!openShelf) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A DocSheet raised over the leaf owns Esc first.
      if (document.querySelector('[role="dialog"]')) return;
      // So does a control the reader is typing in: Esc reverts a field or
      // dismisses its combobox. Putting the whole shelf away instead would
      // throw the edit out with the keystroke meant to undo it.
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openShelf, onClose]);

  useEffect(() => {
    const onRequest = () => onClose();
    window.addEventListener(CLOSE_SHELF_EVENT, onRequest);
    return () => window.removeEventListener(CLOSE_SHELF_EVENT, onRequest);
  }, [onClose]);

  if (!openShelf) return null;
  if (!fullTier && routes) return null;
  const shelf = shelfDefinition(openShelf);

  return (
    <aside
      id={SHELF_LEAF_ID}
      role="region"
      aria-label={`${shelf.title} shelf`}
      data-shelf-leaf={openShelf}
      className="fixed left-0 top-0 z-[45] hidden h-screen w-[320px] overflow-y-auto border-r border-[var(--color-pearl)] bg-[var(--doc-paper)] px-4 pb-10 pt-5 min-[1440px]:left-[200px] min-[1440px]:block"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]">
            {shelf.eyebrow}
          </p>
          <h2 className="mt-1 font-heading text-[18px] font-medium leading-tight text-[var(--color-charcoal)]">
            {shelf.title}
          </h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="min-h-11 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.09em] text-[var(--color-charcoal)] hover:text-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
        >
          ✕ Close
        </button>
      </div>

      <div className="mt-4">{children}</div>
    </aside>
  );
}
