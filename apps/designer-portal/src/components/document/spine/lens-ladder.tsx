'use client';

/**
 * The ladder — the rail below the `--rule-mid`, and the whole of what this
 * paper is (R127 §4, C-3/C-4). One segment per stop the spread actually prints,
 * the reading window bracketing her share of it, the rooms beneath Pieces, and
 * the doors filed under `FILED WITH THIS JOB`.
 *
 * It replaces `spine-running-index.tsx` and `spine-shelved-blocks.tsx`
 * (OD-16). The reading-line measurement is the one piece carried over: the
 * bracket is a single element measured off the active row, so it SLIDES between
 * stops instead of blinking from one to the next — and it travels on
 * `transform`, never on a layout property, because driving y through `top`
 * files a `layout-shift` entry every frame (D-B1).
 *
 * Both desktop tiers mount this, once. Nothing here sniffs the viewport: the
 * two tiers differ by class — the narrow measure hides the room rungs and
 * prints Pieces' spliced `· N ROOMS` value instead (OD-14) — so there is no
 * width state to get wrong and no second render to keep in step.
 */

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import type { DocumentIndexKey } from '@/lib/document/document-index';
import type {
  LadderDoor,
  LadderSegment,
} from '@/lib/document/lens-ladder-derivation';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface LensLadderProps {
  segments: readonly LadderSegment[];
  doors: readonly LadderDoor[];
  activeKey: DocumentIndexKey | null;
  /** The stop whose own `[data-region-head]` is in frame. Its value yields and
   *  its NAME prints (RF-02), so the bracket never sits on blank rail. W3 wires
   *  the observer; until then nothing is in frame. */
  headInFrame?: DocumentIndexKey | null;
  onJump: (key: DocumentIndexKey) => void;
  onToggleRoom?: (roomId: string) => void;
}

const NAME_CLASS = 'block text-[13px] leading-tight';
const VALUE_CLASS =
  'mt-px block break-words font-mono text-[11px] uppercase leading-tight tracking-[0.07em]';

export function LensLadder({
  segments,
  doors,
  activeKey,
  headInFrame = null,
  onJump,
  onToggleRoom,
}: LensLadderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const windowRef = useRef<HTMLSpanElement | null>(null);
  const segmentRefs = useRef(new Map<DocumentIndexKey, HTMLButtonElement>());
  const [roving, setRoving] = useState(0);

  const heldRoom = segments.some((segment) =>
    segment.rooms?.some((room) => room.held),
  );
  // Override 2 — the rooms print while the bracket touches Pieces or a room is
  // in hand, and never at the narrow measure (OD-14), where Pieces carries the
  // room count in its own value instead.
  const printRooms = activeKey === 'ffe' || heldRoom;

  /** The bracket, measured off the active row and written imperatively: React
   *  owns the rows, the rAF handler owns the bracket, and neither re-renders
   *  the other. */
  const place = useCallback(() => {
    const bracket = windowRef.current;
    if (!bracket) return;
    const row = activeKey ? segmentRefs.current.get(activeKey) : undefined;
    if (!row) {
      bracket.hidden = true;
      bracket.removeAttribute('data-lens-window');
      return;
    }
    const top = row.offsetTop;
    const height = row.offsetHeight;
    bracket.hidden = false;
    bracket.style.height = `${height}px`;
    bracket.style.transform = `translateY(${top}px)`;
    bracket.setAttribute('data-lens-window', `${top}:${height}`);
  }, [activeKey]);

  useIsomorphicLayoutEffect(place, [place, segments, printRooms]);

  useEffect(() => {
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [place]);

  // Tab reaches the ladder once; the arrows walk it (proposal §4, "tab order,
  // stated"). The rows are read from the DOM rather than from a second list, so
  // the rungs the narrow tier hides are simply not there to walk.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : 0;
    if (step === 0 && event.key !== 'Home' && event.key !== 'End') return;
    const rows = Array.from(
      trackRef.current?.querySelectorAll<HTMLElement>('[data-ladder-row]') ??
        [],
    );
    if (rows.length === 0) return;
    const from = rows.findIndex((row) => row === document.activeElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? rows.length - 1
          : (Math.max(from, 0) + step + rows.length) % rows.length;
    event.preventDefault();
    setRoving(next);
    rows[next]?.focus();
  };

  let rowIndex = -1;
  const nextRow = () => {
    rowIndex += 1;
    return rowIndex;
  };

  return (
    <nav
      aria-label="This paper"
      data-lens-ladder
      data-reading-index={activeKey ?? undefined}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        ref={trackRef}
        onKeyDown={onKeyDown}
        className="relative flex min-h-0 flex-1 flex-col pl-3"
      >
        <span
          ref={windowRef}
          aria-hidden
          hidden
          className="absolute left-0 top-0 w-0 [border-left:var(--rule-mid)] transition-[transform] duration-200 ease-out motion-reduce:transition-none"
        />

        {segments.length === 0 ? (
          // OD-2 — until Wave 5 the pre-work spreads put no region on the
          // paper. The track says so, in words, and is not a press target.
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Nothing on this paper yet
          </p>
        ) : (
          segments.map((segment) => {
            const current = segment.key === activeKey;
            const yielded = segment.key === headInFrame;
            const index = nextRow();
            return (
              <div
                key={segment.key}
                data-ladder-segment={segment.key}
                // The floor is taken first and the remainder distributes by
                // extent, so `flex-basis` IS the floor and `flex-grow` IS the
                // count. The two floors ride as custom properties because they
                // differ by measure and only a class may carry a media query.
                className="[--seg-floor:var(--seg-floor-narrow)] min-[1440px]:[--seg-floor:var(--seg-floor-full)]"
                style={
                  {
                    '--seg-floor-narrow': `${segment.narrowFloorPx}px`,
                    '--seg-floor-full': `${segment.floorPx}px`,
                    flexBasis: 'var(--seg-floor)',
                    flexGrow: segment.extent,
                    flexShrink: 0,
                  } as CSSProperties
                }
              >
                <button
                  type="button"
                  data-ladder-row
                  data-index-region={segment.key}
                  data-region-head-in-frame={yielded ? 'true' : undefined}
                  aria-current={current ? 'true' : 'false'}
                  tabIndex={index === roving ? 0 : -1}
                  disabled={!segment.mounted}
                  ref={(el) => {
                    if (el) segmentRefs.current.set(segment.key, el);
                    else segmentRefs.current.delete(segment.key);
                  }}
                  onFocus={() => setRoving(index)}
                  onClick={() => onJump(segment.key)}
                  className="block w-full py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
                >
                  <span
                    className={`${NAME_CLASS} ${
                      current
                        ? 'font-semibold text-[var(--color-charcoal)]'
                        : 'text-[var(--color-charcoal)]'
                    }`}
                  >
                    {segment.name}
                  </span>
                  {/* RF-02 — while the stop's own head is in frame the paper is
                      saying the figure at 24px Playfair, so the rail yields the
                      value and keeps the name. */}
                  {!yielded &&
                    (segment.value === null ? (
                      <span
                        className={`${VALUE_CLASS} text-[var(--text-muted)]`}
                      >
                        {segment.fallback ?? 'Nothing yet'}
                      </span>
                    ) : segment.value === segment.narrowValue ? (
                      <span
                        className={`${VALUE_CLASS} ${
                          current
                            ? 'text-[var(--text-primary)]'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {segment.value}
                      </span>
                    ) : (
                      // OD-14 — one register, two measures: the narrow value
                      // splices the room count in and drops the damage date.
                      <>
                        <span
                          className={`${VALUE_CLASS} min-[1440px]:hidden ${
                            current
                              ? 'text-[var(--text-primary)]'
                              : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {segment.narrowValue}
                        </span>
                        <span
                          className={`${VALUE_CLASS} hidden min-[1440px]:block ${
                            current
                              ? 'text-[var(--text-primary)]'
                              : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {segment.value}
                        </span>
                      </>
                    ))}
                </button>

                {segment.rooms && segment.rooms.length > 0 && printRooms && (
                  <div className="hidden min-[1440px]:block">
                    {segment.rooms.map((room) => {
                      const roomIndex = nextRow();
                      return (
                        <button
                          key={room.id}
                          type="button"
                          data-ladder-row
                          data-room-chip={room.id}
                          aria-pressed={room.held}
                          tabIndex={roomIndex === roving ? 0 : -1}
                          onFocus={() => setRoving(roomIndex)}
                          onClick={() => onToggleRoom?.(room.id)}
                          className={`flex min-h-11 w-full items-center pl-3 text-left text-[13px] leading-tight text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
                            room.held
                              ? 'font-semibold text-[var(--color-clay-ink)]'
                              : ''
                          }`}
                        >
                          {room.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* The doors. F09's four words never vanish below the top at either
          desktop tier; the head reserves its two narrow lines (OD-14) so it can
          never overprint `Plan room`. */}
      <div className="mt-3 shrink-0 border-t border-[var(--color-pearl)] pt-3">
        <p className="mb-1 min-h-[34px] font-mono text-[11px] uppercase leading-tight tracking-[0.1em] text-[var(--text-muted)]">
          Filed with this job
        </p>
        {doors.map((door) => {
          const className =
            'flex min-h-11 w-full items-center text-left text-[13px] leading-tight text-[var(--color-charcoal)] hover:text-[var(--color-clay-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]';
          return door.href ? (
            <Link
              key={door.key}
              href={door.href}
              data-ladder-door={door.key}
              className={className}
            >
              {door.label}
            </Link>
          ) : (
            <button
              key={door.key}
              type="button"
              data-ladder-door={door.key}
              onClick={door.onOpen}
              className={className}
            >
              {door.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
