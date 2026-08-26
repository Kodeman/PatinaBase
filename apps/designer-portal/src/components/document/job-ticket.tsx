'use client';

/**
 * The job ticket — one band between the letterhead and the guide, eight rows,
 * every width, every project-kind section. A rule above, a rule below: no box,
 * no fill, no shadow (C2/D4). Labels DM Mono, values Inter, `→` is the door.
 *
 * THE STICKY SEAM (R124). While the letterhead is on screen the ticket prints
 * its eight rows. Once the letterhead scrolls past, the ticket collapses in
 * place to its two-line form and sticks — at every width, so the map rides
 * with the reader the way the spine's blocks used to. The pin is an
 * IntersectionObserver on a sentinel the page renders beside the letterhead;
 * a scroll listener would run on every frame to learn the same one bit.
 *
 * The sentinel is addressed by DOM id rather than a ref object: the letterhead
 * mounts above this component and a ref's `.current` landing later would not
 * re-run the observer effect, so the pin would silently never engage.
 *
 * Below 1180 the ticket opens AT REST as the seam and unfolds to the eight
 * rows; at or above it opens unfolded. Either way the reader's own fold is
 * honoured until the pin state changes underneath it.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { DocumentIndexKey } from '@/lib/document/document-index';
import type { ShelfLeafKey } from '@/lib/document/shelves';
import type { TicketRow, TicketSeam } from '@/lib/document/ticket-derivation';
import { useRoomLens } from './room-lens-context';

/** The id the page gives the element it renders directly under the letterhead. */
export const LETTERHEAD_SENTINEL_ID = 'doc-letterhead-sentinel';

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
  /** ≥1440 — open the 320px leaf beside the spine (the `onToggleShelf`
   *  contract the spine's shelves block used). */
  onOpenLeaf: (shelf: ShelfLeafKey) => void;
  /** Below 1440 — each leaf's own page. A shelf with no route falls back to
   *  the leaf rather than printing a door that goes nowhere. */
  routes: Partial<Record<ShelfLeafKey, string>>;
  /** `requestRegionUnfold` plus the scroll the caller already owns. */
  onUnfoldRegion: (region: DocumentIndexKey) => void;
  onOpenCallSheet: () => void;
  /** The letterhead's sentinel element id. */
  letterheadSentinel?: string;
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

function useMediaMatch(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia?.(query);
    if (!media) return;
    setMatches(media.matches);
    const onChange = () => setMatches(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

function RowBody({ row }: { row: TicketRow }) {
  const hasDoor = row.door.kind !== 'overlay' || row.door.available;
  return (
    <>
      <span className={LABEL_CLASS}>{row.label}</span>
      <span className={VALUE_CLASS}>{row.value}</span>
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
  onOpenLeaf,
  routes,
  onUnfoldRegion,
  onOpenCallSheet,
  letterheadSentinel = LETTERHEAD_SENTINEL_ID,
}: JobTicketProps) {
  const { heldRoomId, toggleRoom } = useRoomLens();
  const wide = useMediaMatch(LEAF_QUERY);
  const seamAtRest = useMediaMatch(SEAM_AT_REST_QUERY);
  const [pinned, setPinned] = useState(false);
  const [fold, setFold] = useState<boolean | null>(null);
  const [roomsOpen, setRoomsOpen] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (typeof IntersectionObserver === 'undefined') return;
    const sentinel = document.getElementById(letterheadSentinel);
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [letterheadSentinel]);

  // The reader's own fold is theirs until the letterhead crosses the edge —
  // then the ticket collapses in place, and unfolding again is a fresh choice.
  useEffect(() => {
    setFold(null);
  }, [pinned]);

  const unfolded = fold ?? (!pinned && !seamAtRest);

  const renderRow = (row: TicketRow): ReactNode => {
    const door = row.door;
    const body = <RowBody row={row} />;

    switch (door.kind) {
      case 'route':
        return (
          <a href={door.href} className={ROW_CLASS}>
            {body}
          </a>
        );
      case 'leaf': {
        const href = routes[door.shelf];
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
      case 'expand':
        return (
          <button
            type="button"
            aria-expanded={roomsOpen}
            onClick={() => setRoomsOpen((open) => !open)}
            className={ROW_CLASS}
          >
            {body}
          </button>
        );
    }
  };

  return (
    <section
      aria-label="The job"
      data-job-ticket=""
      data-pinned={pinned ? 'true' : undefined}
      data-unfolded={unfolded ? 'true' : undefined}
      className="sticky top-0 z-[3] border-y border-[var(--color-pearl)] bg-[var(--doc-paper)] py-2.5"
    >
      {unfolded ? (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
              {seam.identity}
            </p>
            <button
              type="button"
              aria-expanded
              onClick={() => setFold(false)}
              className={FOLD_CLASS}
            >
              Fold ↑
            </button>
          </div>
          <div className="mt-1.5">
            {rows.map((row) => (
              <div
                key={row.key}
                data-ticket-row={row.key}
                className="border-b border-[rgba(44,41,38,0.10)] last:border-b-0"
              >
                {renderRow(row)}
                {row.door.kind === 'expand' && roomsOpen && (
                  <div
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
        </>
      ) : (
        <>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            {seam.identity}
          </p>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <p className="min-w-0 text-[13.5px] leading-snug text-[var(--color-charcoal)]">
              {seam.exceptions}
            </p>
            <button
              type="button"
              aria-expanded={false}
              onClick={() => setFold(true)}
              className={FOLD_CLASS}
            >
              Unfold ↓
            </button>
          </div>
        </>
      )}
    </section>
  );
}
