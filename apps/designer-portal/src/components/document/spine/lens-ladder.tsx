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
  BookOpen,
  Compass,
  FileText,
  LayoutGrid,
  Undo2,
  Users,
  type LucideIcon,
} from 'lucide-react';
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
import { LADDER_SEGMENT_MIN_PX } from '@/lib/document/lens-constants';
import type {
  LadderDoor,
  LadderDoorKey,
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

/**
 * D-B11 (amended) — a room rung is a 27px cell, the same 2.5.8 pointer-floor
 * the design lead set for the arc. The doors keep their 44px: they are the
 * rail's own furniture and they never compete with the track for height.
 */
const ROOM_RUNG_PX = 27;

/**
 * W7-R1 §3 — one glyph per door. Kody: "filed with this job items should have
 * an icon for each room." They are decoration beside the word that is already
 * the label: 14px, 1.5 stroke, `currentColor` (so each icon inherits the row's
 * charcoal and its clay-ink hover, and no hex ink enters the rail), and
 * `aria-hidden`, so the accessible name and the R1 label census are unchanged.
 */
const DOOR_ICON: Record<LadderDoorKey, LucideIcon> = {
  planroom: Compass,
  specbook: BookOpen,
  moodboards: LayoutGrid,
  callsheet: Users,
  clientcopy: FileText,
  'release-room': Undo2,
};

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
  // The tabstop is held as the ROW'S OWN KEY, never as a position: the row
  // list changes under it (the rungs appear and go, a stop that has not
  // mounted is not a row at all), and a stored integer past the end leaves
  // every row at `tabIndex={-1}` — the whole rail silently out of Tab order.
  const [roving, setRoving] = useState<string | null>(null);

  const heldRoom = segments.some((segment) =>
    segment.rooms?.some((room) => room.held),
  );
  // Override 2 — the rooms print while the bracket touches Pieces or a room is
  // in hand, and never at the narrow measure (OD-14), where Pieces carries the
  // room count in its own value instead.
  // D-B37 — the rungs follow the INDEX (`aria-current`, the reading stop) and
  // the room in hand, never `headInFrame`: the L-6 yield is a paint state, and
  // hanging rungs off it would add and remove whole 27px rows as a head crossed
  // the frame's top band — the same rail reflow the value line's yield caused.
  const printRooms = activeKey === 'ffe' || heldRoom;

  // How many rungs the track can hold out of what is left once every stop has
  // its floor. Measured, because it is a question about the rail's height and
  // nothing in the data answers it; `Infinity` until the first layout, so the
  // server and the first client paint agree. The rest collapse to one `+N`
  // line rather than overprinting the doors beneath them.
  const [rungCap, setRungCap] = useState(Number.POSITIVE_INFINITY);

  const roomCount = segments.reduce(
    (n, segment) => n + (segment.rooms?.length ?? 0),
    0,
  );
  const shownRungs = printRooms ? Math.min(roomCount, rungCap) : 0;
  const hiddenRungs = printRooms ? roomCount - shownRungs : 0;

  // The rows as they are RENDERED, in DOM order — the same walk the keyboard
  // takes, computed once so the tabstop can be clamped to it.
  const rowKeys: string[] = [];
  for (const segment of segments) {
    if (segment.mounted) rowKeys.push(`seg:${segment.key}`);
    if (segment.rooms && printRooms) {
      for (const room of segment.rooms.slice(0, shownRungs)) {
        rowKeys.push(`room:${room.id}`);
      }
    }
  }
  // Exactly one row carries `tabIndex={0}` at all times: the remembered row
  // while it is still on the rail, the first row the moment it is not.
  const rovingKey =
    roving !== null && rowKeys.includes(roving) ? roving : (rowKeys[0] ?? null);

  useIsomorphicLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || segments.length === 0 || roomCount === 0) return;
    // A track with no measured height has not been laid out — the rail is
    // below 1180 and display:none, or this is jsdom, which reports 0 for
    // everything. Neither is an answer, and neither may collapse the rungs.
    if (track.clientHeight <= 0) return;
    // The rungs are paid for out of what the track has left once every stop
    // row has printed at its own natural height (D-B52: the rows no longer
    // grow, so the remainder is simply the track's height less the rows).
    // A stop row's height does not move with the cap, so this converges in
    // one pass rather than oscillating.
    const stops = Array.from(
      track.querySelectorAll<HTMLElement>('[data-ladder-stop]'),
    ).reduce(
      (sum, stop) => sum + Math.max(stop.offsetHeight, LADDER_SEGMENT_MIN_PX),
      0,
    );
    if (stops === 0) return;
    // The free space is the NAV's, not the track's. D-B52 stopped the track
    // growing into its column, so its own height is now the height of the rows
    // it is already printing — reading the remainder off it would ratchet the
    // cap down and never let it back up when the window is enlarged again.
    const nav = track.parentElement;
    if (!nav) return;
    const doorsBox = nav.querySelector<HTMLElement>('[data-ladder-doors]');
    const gap = Number.parseFloat(getComputedStyle(track).marginBottom) || 0;
    const available = nav.clientHeight - (doorsBox?.offsetHeight ?? 0) - gap;
    const slots = Math.max(0, Math.floor((available - stops) / ROOM_RUNG_PX));
    // One of the slots goes to the `+N` line itself when there is one.
    const fits = roomCount <= slots ? roomCount : Math.max(0, slots - 1);
    setRungCap((previous) => (previous === fits ? previous : fits));
  }, [segments, roomCount, printRooms]);

  /** The bracket, measured off the active row and written imperatively: React
   *  owns the rows, the rAF handler owns the bracket, and neither re-renders
   *  the other. */
  const place = useCallback(() => {
    const bracket = windowRef.current;
    if (!bracket) return;
    // D-B52 — the bracket spans the ROWS of the stops the rail knows are in
    // frame: the reading stop, and the stop whose own head is in frame where
    // that is a different one. With the rows packed at their natural heights
    // there is no extent share left to map onto, so the window is simply the
    // union of those rows' boxes, floored at one rung (27px) so a short row
    // still prints a readable bracket.
    // Anchored on the reading stop: with no index there is no window, exactly
    // as before — the bracket never sits on rail the reader is not in.
    const rows = (activeKey ? [activeKey, headInFrame] : [])
      .filter((key): key is DocumentIndexKey => key != null)
      .map((key) => segmentRefs.current.get(key))
      .filter((row): row is HTMLButtonElement => row != null);
    if (rows.length === 0) {
      bracket.hidden = true;
      bracket.removeAttribute('data-lens-window');
      return;
    }
    const top = Math.min(...rows.map((row) => row.offsetTop));
    const bottom = Math.max(
      ...rows.map((row) => row.offsetTop + row.offsetHeight),
    );
    const height = Math.max(ROOM_RUNG_PX, bottom - top);
    bracket.hidden = false;
    bracket.style.height = `${height}px`;
    bracket.style.transform = `translateY(${top}px)`;
    bracket.setAttribute('data-lens-window', `${top}:${height}`);
  }, [activeKey, headInFrame]);

  // A value that yields (RF-02) unmounts the value line and changes the row's
  // height, so the bracket must re-measure on it as well as on the row list.
  const valueSignature = segments
    .map((segment) => `${segment.key}:${segment.value}:${segment.narrowValue}`)
    .join('|');
  useIsomorphicLayoutEffect(place, [
    place,
    segments,
    printRooms,
    headInFrame,
    valueSignature,
  ]);

  useEffect(() => {
    // `place` reads `offsetTop`/`offsetHeight` — a forced layout. A drag of the
    // window edge fires resize per pixel, so the read rides one rAF like the
    // running index's scroll handler does.
    let queued = false;
    const onResize = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        place();
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [place]);

  // Tab reaches the ladder once; the arrows walk it (proposal §4, "tab order,
  // stated"). The rows are read from the DOM, and a row the narrow tier hides
  // is skipped: `focus()` on a `display:none` element is a silent no-op, which
  // would move the tabstop onto a row the reader can neither see nor reach.
  const walkableRows = (): HTMLElement[] => {
    const rows = Array.from(
      trackRef.current?.querySelectorAll<HTMLElement>('[data-ladder-row]') ??
        [],
    );
    const shown = rows.filter(
      (row) => row.offsetParent !== null || row.getClientRects().length > 0,
    );
    // jsdom reports no layout for anything, so an empty result means the
    // environment cannot answer the question, not that every row is hidden.
    return shown.length > 0 ? shown : rows;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : 0;
    if (step === 0 && event.key !== 'Home' && event.key !== 'End') return;
    const rows = walkableRows();
    if (rows.length === 0) return;
    const from = rows.findIndex((row) => row === document.activeElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? rows.length - 1
          : (Math.max(from, 0) + step + rows.length) % rows.length;
    event.preventDefault();
    const target = rows[next];
    if (!target) return;
    setRoving(target.getAttribute('data-ladder-row'));
    target.focus();
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
        data-lens-track
        onKeyDown={onKeyDown}
        // D-B52 — the track takes its ROWS' height and nothing more: no
        // basis, no growth. Kody: "between sections there should not be giant
        // gaps, the only gap should be after 'the record'." The `--track-floor`
        // arithmetic (and the pre-work zero-floor special case it needed) is
        // gone with the growth it fed. It still scrolls itself when the column
        // genuinely cannot hold the rows, so the head and `FILED WITH THIS
        // JOB` stay whole and no rung overprints a door. `mb-3` on the rows
        // keeps the 12px separation in exactly that case, where the doors'
        // `mt-auto` collapses to zero.
        className="relative mb-3 flex min-h-0 flex-col overflow-y-auto pl-3 [scrollbar-width:thin]"
        style={
          {
            flexBasis: 'auto',
            flexGrow: 0,
            flexShrink: 1,
          } as CSSProperties
        }
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
            const rowKey = `seg:${segment.key}`;
            // The value line is the same either way; only whether the name
            // above it is a press target differs.
            const body = (
              <>
                <span
                  data-rail-label
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
                    value and keeps the name.

                    D-B37 — the yield is a PAINT change and never a layout one.
                    Unrendering the line took its box away too, and the row
                    shrank under it — chrome moving on a step whose reading
                    index never changed, which is what D-B34's cause gate
                    caught. The line now always renders and always takes its
                    box; yielded, it is `visibility: hidden` and out of the
                    accessibility tree. */}
                <span
                  className={`block ${yielded ? 'invisible' : ''}`}
                  aria-hidden={yielded ? 'true' : undefined}
                  data-ladder-value={segment.key}
                  data-ladder-value-yielded={yielded ? 'true' : undefined}
                  data-rail-value
                >
                  {segment.value === null ? (
                    <span className={`${VALUE_CLASS} text-[var(--text-muted)]`}>
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
                  )}
                </span>
              </>
            );
            return (
              <div
                key={segment.key}
                data-ladder-segment={segment.key}
                // D-B52 — the row takes the height its own words need and no
                // more: `flex: none` over a 36px minimum. Nothing redistributes
                // freed height any more, so a stop's box cannot move on a step
                // that did not change what the stop prints (D-B37, strictly
                // stronger), and the stops pack against each other instead of
                // opening a rail-wide gap between every pair.
                style={
                  {
                    flexBasis: 'auto',
                    flexGrow: 0,
                    flexShrink: 0,
                    minHeight: LADDER_SEGMENT_MIN_PX,
                  } as CSSProperties
                }
              >
                {segment.mounted ? (
                  <button
                    type="button"
                    data-ladder-row={rowKey}
                    data-ladder-stop={segment.key}
                    data-index-region={segment.key}
                    data-region-head-in-frame={yielded ? 'true' : undefined}
                    aria-current={current ? 'true' : 'false'}
                    tabIndex={rowKey === rovingKey ? 0 : -1}
                    ref={(el) => {
                      if (el) segmentRefs.current.set(segment.key, el);
                      else segmentRefs.current.delete(segment.key);
                    }}
                    onFocus={() => setRoving(rowKey)}
                    onClick={() => onJump(segment.key)}
                    className="block w-full py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
                  >
                    {body}
                  </button>
                ) : (
                  // A stop the spread declares but does not mount has nowhere
                  // to send her: no root to scroll to, no heading to land focus
                  // on. It still PRINTS — the paper's order is the point — but
                  // as text, out of the roving walk and out of Tab order.
                  <div
                    role="text"
                    data-ladder-unmounted={segment.key}
                    data-ladder-stop={segment.key}
                    data-index-region={segment.key}
                    className="block w-full py-1 text-left"
                  >
                    {body}
                  </div>
                )}

                {segment.rooms &&
                  segment.rooms.length > 0 &&
                  printRooms &&
                  segment.rooms.slice(0, shownRungs).map((room) => {
                    const roomRowKey = `room:${room.id}`;
                    return (
                      <button
                        key={room.id}
                        type="button"
                        data-ladder-row={roomRowKey}
                        data-room-chip={room.id}
                        aria-pressed={room.held}
                        tabIndex={roomRowKey === rovingKey ? 0 : -1}
                        onFocus={() => setRoving(roomRowKey)}
                        onClick={() => onToggleRoom?.(room.id)}
                        // OD-14 — the rungs belong to the full measure only.
                        // Hidden by class, never by a width read, and skipped
                        // by the arrow walk while they are hidden.
                        className={`hidden min-h-[27px] w-full items-center pl-3 text-left text-[13px] leading-tight text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] min-[1440px]:flex ${
                          room.held
                            ? 'font-semibold text-[var(--color-clay-ink)]'
                            : ''
                        }`}
                      >
                        {room.name}
                      </button>
                    );
                  })}

                {segment.rooms && printRooms && hiddenRungs > 0 && (
                  // The rail never runs out of room silently: the rungs the
                  // track cannot hold are counted, not overprinted.
                  <p
                    data-ladder-rooms-overflow={hiddenRungs}
                    className="hidden min-h-[27px] items-center pl-3 font-mono text-[11px] uppercase tracking-[0.07em] text-[var(--text-muted)] min-[1440px]:flex"
                  >
                    +{hiddenRungs} more
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* The doors. F09's four words never vanish below the top at either
          desktop tier; the head reserves its two narrow lines (OD-14) so it can
          never overprint `Plan room`.

          The heading is the doors' — it prints only where there is a door to
          file under it. A spread with none (a pre-work proposal carries no
          project, so OD-8 gives it none of the project doors) got a rule, a
          34px reserve and a word standing over nothing. */}
      {doors.length > 0 && (
        // D-B52 — `mt-auto` is the nav column's ONE flexible gap, and it sits
        // here: between `The record` and this rule. On a short viewport the
        // auto margin collapses to zero and the rows' own `mb-3` keeps a
        // breath above the border.
        <div
          data-ladder-doors
          className="mt-auto shrink-0 border-t border-[var(--color-pearl)] pt-3"
        >
          <p
            data-rail-label
            className="mb-1 min-h-[34px] font-mono text-[11px] uppercase leading-tight tracking-[0.1em] text-[var(--text-muted)]"
          >
            Filed with this job
          </p>
          {doors.map((door) => {
            const className =
              'flex min-h-11 w-full items-center gap-[8px] text-left text-[13px] leading-tight text-[var(--color-charcoal)] hover:text-[var(--color-clay-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]';
            const Icon = DOOR_ICON[door.key];
            const glyph = (
              <Icon
                size={14}
                strokeWidth={1.5}
                color="currentColor"
                aria-hidden="true"
                className="shrink-0"
              />
            );
            return door.href ? (
              <Link
                key={door.key}
                href={door.href}
                data-ladder-door={door.key}
                data-rail-label
                className={className}
              >
                {glyph}
                {door.label}
              </Link>
            ) : (
              <button
                key={door.key}
                type="button"
                data-ladder-door={door.key}
                data-rail-label
                onClick={door.onOpen}
                className={className}
              >
                {glyph}
                {door.label}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}
