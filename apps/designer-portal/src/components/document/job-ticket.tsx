'use client';

/**
 * The job ticket — one band between the letterhead and the guide, eight rows,
 * every width, every project-kind section. A rule above, a rule below: no box,
 * no fill, no shadow (C2/D4). Labels DM Mono, values Inter, `→` is the door.
 *
 * THE STICKY SEAM (R124). While the paper above the ticket is on screen the
 * ticket prints its eight rows. Once that paper scrolls past, the ticket
 * collapses in place to its two-line form and sticks — at every width, so the
 * map rides with the reader the way the spine's blocks used to. The pin is an
 * IntersectionObserver on a sentinel; a scroll listener would run on every
 * frame to learn the same one bit.
 *
 * THE SENTINEL IS THE TICKET'S OWN, rendered immediately above the sticky
 * element in this component's own tree. The ticket stands in one of two
 * positions — under the letterhead on a paper with no table, inside
 * `TableFrame` above the table where one stands — and a sentinel fixed beside
 * the letterhead would, in the second position, flip the pin (collapsing the
 * rows, discarding the reader's fold, and publishing a `--doc-seam-height` for
 * an element nothing is sticking) while the ticket was still far below the
 * viewport top.
 *
 * Below 1180 the ticket opens AT REST as the seam and unfolds to the eight
 * rows; at or above it opens unfolded. Either way the reader's own fold is
 * honoured until the pin state changes underneath it.
 *
 * z-[4], and the pinned seam's height is published as `--doc-seam-height`: the
 * schedule's own pinned glance is `sticky top-0` too, and stands under the seam
 * rather than painting over the map the reader is steering by.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import type { DocumentIndexKey } from '@/lib/document/document-index';
import type { ShelfLeafKey } from '@/lib/document/shelves';
import type {
  TicketHead,
  TicketRow,
  TicketSeam,
  TicketSlotKey,
} from '@/lib/document/ticket-derivation';
import { useRoomLens } from './room-lens-context';

/** The id of the sentinel the ticket renders directly above itself. Exported
 *  for the suites that drive the pin; there is exactly one ticket per document
 *  (`page.tsx`), so there is exactly one of these. */
export const TICKET_SENTINEL_ID = 'doc-ticket-sentinel';

/** How far down the paper the schedule's pinned glance stands while the seam
 *  holds the top. Read by `globals.css`; cleared when the seam is not pinned. */
const SEAM_HEIGHT_VAR = '--doc-seam-height';

/** At or above this the shelf leaf stands beside the spine; below it the row
 *  goes to the leaf's own page (B1-L2's route mode). */
const LEAF_QUERY = '(min-width: 1440px)';
/** Below this the ticket rests as the seam — the phone and the tablet sheet. */
const SEAM_AT_REST_QUERY = '(max-width: 1179px)';

export interface JobTicketProps {
  /** `deriveTicket(input)` — always eight, always in order. */
  rows: readonly TicketRow[];
  /** `deriveTicketSeam(rows, deriveTicketIdentity(input))`. */
  seam: TicketSeam;
  /** `deriveTicketHead(input)` — M2's two-part band head. */
  head: TicketHead;
  /** ≥1440 — open the 320px leaf beside the spine (the `onToggleShelf`
   *  contract the spine's shelves block used). */
  onOpenLeaf: (shelf: ShelfLeafKey) => void;
  /** Below 1440 — each leaf's own page. A shelf with no route falls back to
   *  the leaf rather than printing a door that goes nowhere. */
  routes: Partial<Record<ShelfLeafKey, string>>;
  /** `requestRegionUnfold` plus the scroll the caller already owns. */
  onUnfoldRegion: (region: DocumentIndexKey) => void;
  onOpenCallSheet: () => void;
}

const ROW_CLASS =
  '-mx-1.5 flex w-[calc(100%+0.75rem)] items-baseline gap-3 px-1.5 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]';

const LABEL_CLASS =
  'w-[5.5rem] shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]';

const VALUE_CLASS =
  'min-w-0 flex-1 text-[13.5px] leading-snug text-[var(--color-charcoal)]';

const DOOR_CLASS = 'shrink-0 font-mono text-[11px] text-[var(--color-aged-oak)]';

const FOLD_CLASS =
  'shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]';

const META_CLASS =
  'font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]';

/** M4's `.b-seam2-l1` — the seam's identity is set in the primary ink, not the
 *  quiet one the band's head wears. Two utilities of the same property in one
 *  class attribute do not resolve by order, so this is its own string. */
const SEAM_IDENTITY_CLASS =
  'font-mono text-[10.5px] uppercase tracking-[0.09em] text-[var(--color-charcoal)]';

/**
 * The tier, read on the FIRST render rather than corrected by an effect: a
 * `false` first paint prints the narrow form of every leaf row at 1440 and the
 * eight-row form at 390, and a press landing before the effect goes to the
 * wrong door. `useSyncExternalStore` is what lets the server and the client
 * disagree here without a hydration warning.
 */
function useMediaMatch(query: string, whenUnknown: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media =
        typeof window === 'undefined' ? null : window.matchMedia?.(query);
      if (!media?.addEventListener) return () => {};
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    [query],
  );
  const read = useCallback(() => {
    const media =
      typeof window === 'undefined' ? null : window.matchMedia?.(query);
    return media ? media.matches : whenUnknown;
  }, [query, whenUnknown]);
  const server = useCallback(() => whenUnknown, [whenUnknown]);
  return useSyncExternalStore(subscribe, read, server);
}

/**
 * Land on a tool the pinned composition already stands on this paper — the
 * Speccing table's rooms rail, its boards strip. `table-slots.tsx` owns the
 * `data-table-slot` address; nothing is scrolled where the slot is unfilled, so
 * a row whose subject is not on the paper simply does not move the reader.
 */
function goToSlot(slot: TicketSlotKey): void {
  const reduceMotion = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  const target = document.querySelector<HTMLElement>(
    `[data-table-slot="${slot}"]`,
  );
  if (!target) return;
  target.scrollIntoView({
    block: 'start',
    behavior: reduceMotion ? 'auto' : 'smooth',
  });
  const landing =
    target.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? target;
  landing.focus?.({ preventScroll: true });
}

/** The row's sentence, with the clause that carries what is wrong given the
 *  weight M2 gives it (`.b-tk-value .b-x`) — the census keeps ledger order. */
function RowValue({ row }: { row: TicketRow }) {
  const at = row.emphasis ? row.value.indexOf(row.emphasis) : -1;
  if (!row.emphasis || at < 0) return <span className={VALUE_CLASS}>{row.value}</span>;
  return (
    <span className={VALUE_CLASS}>
      {row.value.slice(0, at)}
      <strong className="font-medium text-[var(--color-charcoal)]">
        {row.emphasis}
      </strong>
      {row.value.slice(at + row.emphasis.length)}
    </span>
  );
}

function RowBody({ row, hasDoor }: { row: TicketRow; hasDoor: boolean }) {
  return (
    <>
      <span className={LABEL_CLASS}>{row.label}</span>
      <RowValue row={row} />
      {hasDoor && (
        <span aria-hidden className={DOOR_CLASS}>
          →
        </span>
      )}
    </>
  );
}

export function JobTicket({
  rows,
  seam,
  head,
  onOpenLeaf,
  routes,
  onUnfoldRegion,
  onOpenCallSheet,
}: JobTicketProps) {
  const { heldRoomId, toggleRoom } = useRoomLens();
  const wide = useMediaMatch(LEAF_QUERY, true);
  const seamAtRest = useMediaMatch(SEAM_AT_REST_QUERY, false);
  const [pinned, setPinned] = useState(false);
  const [fold, setFold] = useState<boolean | null>(null);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const foldRef = useRef<HTMLButtonElement>(null);
  // Whether the reader is standing inside the ticket. Read on the fold, not
  // asked of `document.activeElement`: by the time the effect runs the row
  // they were on has already been unmounted and the browser has parked focus
  // on <body>, which is indistinguishable from never having been here.
  const focusWithin = useRef(false);
  const ids = useId();
  const rowsId = `${ids}-rows`;
  const chipsId = `${ids}-rooms`;

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // The reader's own fold is theirs until the letterhead crosses the edge —
  // then the ticket collapses in place, and unfolding again is a fresh choice.
  // A reader standing on a row when that happens has that row unmounted under
  // them, so focus lands on the control that puts the rows back rather than on
  // <body>; its label and aria-expanded state are the announcement.
  useEffect(() => {
    setFold(null);
    const active = document.activeElement;
    const stillInside =
      active instanceof HTMLElement && sectionRef.current?.contains(active);
    if (!focusWithin.current || stillInside) return;
    foldRef.current?.focus();
  }, [pinned]);

  const unfolded = fold ?? (!pinned && !seamAtRest);

  // The schedule's pinned glance sticks to the same top-0 the seam does. It
  // reads this to stand under the seam instead of over it.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!pinned || unfolded) {
      root.style.removeProperty(SEAM_HEIGHT_VAR);
      return undefined;
    }
    const height = sectionRef.current?.getBoundingClientRect().height ?? 0;
    root.style.setProperty(SEAM_HEIGHT_VAR, `${Math.round(height)}px`);
    return () => {
      root.style.removeProperty(SEAM_HEIGHT_VAR);
    };
  }, [pinned, unfolded, seam.identity, seam.exceptions]);

  const renderRow = (row: TicketRow): ReactNode => {
    const door = row.door;
    // The leaf stands beside the spine only from 1440px. Below that a shelf
    // with no page of its own has nowhere to send the reader, so the row prints
    // no `→` and does not press — a button that fires an unfold nobody hears is
    // a worse answer than a row that plainly does not open.
    const deadLeaf = door.kind === 'leaf' && !wide && !routes[door.shelf];
    const hasDoor =
      door.kind !== 'none' &&
      !deadLeaf &&
      (door.kind !== 'overlay' || door.available);
    const body = <RowBody row={row} hasDoor={hasDoor} />;

    switch (door.kind) {
      case 'route':
        return (
          <a href={door.href} className={ROW_CLASS}>
            {body}
          </a>
        );
      case 'leaf': {
        const href = routes[door.shelf];
        if (deadLeaf) return <div className={ROW_CLASS}>{body}</div>;
        return !wide && href ? (
          <a href={href} className={ROW_CLASS}>
            {body}
          </a>
        ) : (
          <button
            type="button"
            onClick={() => onOpenLeaf(door.shelf)}
            className={ROW_CLASS}
          >
            {body}
          </button>
        );
      }
      case 'slot':
        return (
          <button
            type="button"
            onClick={() => goToSlot(door.slot)}
            className={ROW_CLASS}
          >
            {body}
          </button>
        );
      case 'unfold-region':
        return (
          <button
            type="button"
            onClick={() => onUnfoldRegion(door.region)}
            className={ROW_CLASS}
          >
            {body}
          </button>
        );
      case 'overlay':
        return door.available ? (
          <button type="button" onClick={onOpenCallSheet} className={ROW_CLASS}>
            {body}
          </button>
        ) : (
          <div className={ROW_CLASS}>{body}</div>
        );
      case 'none':
        return <div className={ROW_CLASS}>{body}</div>;
      case 'expand':
        return (
          <button
            type="button"
            aria-expanded={roomsOpen}
            aria-controls={chipsId}
            onClick={() => setRoomsOpen((open) => !open)}
            className={ROW_CLASS}
          >
            {body}
          </button>
        );
    }
  };

  return (
    <>
      {/* The pin's one bit of input, in flow directly above the sticky element:
          it leaves the viewport exactly when the ticket would begin to stick. */}
      <div ref={sentinelRef} id={TICKET_SENTINEL_ID} aria-hidden />
      <section
      ref={sectionRef}
      aria-label="The job"
      data-job-ticket=""
      data-pinned={pinned ? 'true' : undefined}
      data-unfolded={unfolded ? 'true' : undefined}
      onFocus={() => {
        focusWithin.current = true;
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && sectionRef.current?.contains(next)) return;
        focusWithin.current = false;
      }}
      className="sticky top-0 z-[4] border-y border-[var(--color-pearl)] bg-[var(--doc-paper)] py-2.5"
    >
      {/* The head and the fold control keep ONE position in the tree across
          both forms, so the control the reader is standing on is not unmounted
          under them every time the ticket folds. */}
      <div
        className={`flex justify-between gap-3 ${
          unfolded ? 'items-baseline' : 'items-end'
        }`}
      >
        <div className="min-w-0 flex-1">
          {unfolded ? (
            <div className="flex items-baseline justify-between gap-4">
              <span className={META_CLASS}>{head.subject}</span>
              {head.phase && (
                <span className={`${META_CLASS} text-right`}>{head.phase}</span>
              )}
            </div>
          ) : (
            <>
              <p className={SEAM_IDENTITY_CLASS}>{seam.identity}</p>
              <p className="mt-1 min-w-0 text-[13.5px] font-medium leading-snug text-[var(--color-charcoal)]">
                {seam.exceptions}
              </p>
            </>
          )}
        </div>
        <button
          ref={foldRef}
          type="button"
          aria-expanded={unfolded}
          aria-controls={rowsId}
          onClick={() => setFold(!unfolded)}
          className={FOLD_CLASS}
        >
          {unfolded ? 'Fold ↑' : 'Unfold ↓'}
        </button>
      </div>

      {unfolded && (
        <div id={rowsId} className="mt-1.5">
          {rows.map((row) => (
            <div
              key={row.key}
              data-ticket-row={row.key}
              className="border-b border-[rgba(44,41,38,0.10)] last:border-b-0"
            >
              {renderRow(row)}
              {row.door.kind === 'expand' && roomsOpen && (
                <div
                  id={chipsId}
                  role="group"
                  aria-label="Rooms on this job"
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-2 pl-[5.5rem]"
                >
                  {row.door.rooms.length === 0 ? (
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
                      No rooms yet
                    </p>
                  ) : (
                    row.door.rooms.map((chip) => {
                      const held = chip.id === heldRoomId;
                      return (
                        <button
                          key={chip.id}
                          type="button"
                          aria-pressed={held}
                          data-room-chip={chip.id}
                          onClick={() => toggleRoom(chip.id)}
                          className={`-mx-1 flex items-baseline gap-1.5 px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
                            held ? 'doc-room-lifted' : ''
                          }`}
                        >
                          <span
                            className={`text-[13px] leading-tight text-[var(--color-charcoal)] ${
                              held ? 'font-semibold' : ''
                            }`}
                          >
                            {chip.name}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
                            {chip.lineCount}
                          </span>
                          {held && (
                            <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--color-charcoal)]">
                              · In hand
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </section>
    </>
  );
}
