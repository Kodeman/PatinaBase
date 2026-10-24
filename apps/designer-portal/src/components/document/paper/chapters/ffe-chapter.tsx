'use client';

/**
 * The round-8 FF&E chapter (WP-01.6, C1 §2). Its Build room doors ("Edit
 * room selections", the head's "Edit pieces & purchasing", a missing-price
 * lead) unfold the embedded Build room here, in place, instead of routing to
 * `/doc/[id]/pieces`:
 *
 * - The doors reach the FF&E body through `FfeWorkRoomContext`; the body is
 *   built once by the page, so this chapter never re-reads it.
 * - Opening pushes `?unfold=pieces&lens=&room=` (`openUnfold`); the address,
 *   not this component, decides open and closed, so Back, Forward and a
 *   reload walk it. The paper is never remounted.
 * - While unfolded, the chapter's own body is hidden, never unmounted: the
 *   room the reader opened, and the control she pressed, are still there to
 *   return to.
 * - The embedded sheet focuses its title; this host owns landing: the room's
 *   heading into view, or the line the address names, opened by id through
 *   `sheet-focus`.
 *
 * Saving inside the sheet is the lenses' own path (`useUpdateProjectFfeSpec`
 * with `expectedRowVersion`, and the line's build fields), saved at once. The
 * Spec pane holds this chapter's `autosaveOwner` while a write is out or a
 * field shows a failed draft, so Return to the room waits, and stays open on
 * the field; it never replays a write. Choosing a Spec line re-addresses the
 * unfold (`line=`, no new entry). The `/doc/[id]/pieces` route keeps
 * resolving under both renderers.
 */

import { useIsFetching, type Query } from '@tanstack/react-query';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import type { BoardOwnerRef } from '@patina/types';
import {
  ffeSheetAutosaveOwner,
  FfeWorkRoomContext,
  type WorkRoom,
} from './ffe-work-room';
import { PiecesSkeleton } from '@/components/loading';
import {
  openUnfold,
  UnfoldInstrument,
  useUnfoldAddress,
  type UnfoldNavigation,
} from '@/components/document/paper/unfold-instrument';
import { useCanSeeMargin } from '@/hooks/use-can-see-margin';
import {
  availableLenses,
  type BuildRoomState,
} from '@/lib/document/pieces/build-room-url';
import type { UnfoldAddress } from '@/lib/document/paper/unfold-url';
import {
  BUILD_ROOM_TITLE_ATTR,
  focusLineAct,
  roomHeading,
} from '@/lib/document/pieces/sheet-focus';

/** How long a landing waits, once the sheet's reads have answered. */
const LANDING_WAIT_MS = 8000;

// The sheet and its lenses load on the first unfold, never with the paper.
const BuildRoom = lazy(() =>
  import('@/components/document/pieces/build-room').then((module) => ({
    default: module.BuildRoom,
  })),
);

export function FfeChapter({
  docId,
  children,
}: {
  /** The id the Document was opened with (`/doc/<id>`). */
  docId: string;
  /** The chapter's FF&E body, as the page built it. */
  children: ReactNode;
}) {
  // Whether money shows only shapes the lens, which the unfolded sheet
  // settles for itself (`EmbeddedBuildRoom`): the paper reads no seat here.
  const unfolded = useUnfoldAddress(true)?.kind === 'pieces';
  // The sheet's spec saves register here; Return to the room waits on them.
  const autosaveOwner = useMemo(() => ffeSheetAutosaveOwner(docId), [docId]);

  const workRoom = useCallback<WorkRoom>(
    (room, lens = 'rough', opener = document.activeElement) => {
      openUnfold(
        { kind: 'pieces', lens, room, line: null },
        { documentId: docId, chapter: 'ffe', room, lens },
        opener,
      );
    },
    [docId],
  );

  return (
    <FfeWorkRoomContext.Provider value={workRoom}>
      <div hidden={unfolded} data-ffe-chapter-body="">
        {children}
      </div>
      <UnfoldInstrument
        kind="pieces"
        label="FF&E schedule"
        canSeeMoney
        chapter="ffe"
        autosaveOwner={autosaveOwner}
      >
        {({ address, close, navigate }) => (
          <EmbeddedBuildRoom
            docId={docId}
            address={address}
            autosaveOwner={autosaveOwner}
            close={close}
            navigate={navigate}
          />
        )}
      </UnfoldInstrument>
    </FfeWorkRoomContext.Provider>
  );
}

/** The page resolves an old proposal or lead address to its project itself. */
const KEEP_ADDRESS = () => {};

function EmbeddedBuildRoom({
  docId,
  address,
  autosaveOwner,
  close,
  navigate,
}: {
  docId: string;
  /** Read with every lens allowed; the seat's money answer is applied here. */
  address: UnfoldAddress;
  autosaveOwner: BoardOwnerRef;
  close: () => void;
  navigate: (next: UnfoldNavigation) => void;
}) {
  const canSeeMoney = useCanSeeMargin();
  // The route's rule (`parseBuildRoomSearch`): Price for a seat without money
  // reads as Rough in, and the address is left as it is.
  const lens = availableLenses(canSeeMoney).includes(address.lens)
    ? address.lens
    : 'rough';
  const hostRef = useRef<HTMLDivElement>(null);
  const onNavigate = useCallback(
    (next: BuildRoomState & { line?: string | null }) =>
      navigate({ lens: next.lens, room: next.room, line: next.line }),
    [navigate],
  );
  const readerHasMoved = useSheetLanding(hostRef, { ...address, lens });
  return (
    <div ref={hostRef} className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<PiecesSkeleton />}>
        <BuildRoom
          docId={docId}
          lens={lens}
          room={address.room}
          line={address.line}
          autosaveOwner={autosaveOwner}
          canSeeMoney={canSeeMoney}
          embedded
          onNavigate={onNavigate}
          onReturn={close}
          onRequestClose={close}
          onRedirect={KEEP_ADDRESS}
          readerHasMoved={readerHasMoved}
        />
      </Suspense>
    </div>
  );
}

/** Keys that scroll the page: pressed, the reader is moving on her own. */
const SCROLL_KEYS = new Set([
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'ArrowUp',
  'ArrowDown',
  ' ',
]);

/**
 * The reads that decide where the sheet lands (F10): its rooms, its lines
 * (and their Spec fields), their placements and their groups. A read
 * anywhere else on the paper never holds the landing's deadline.
 */
const LANDING_READS = new Set([
  'document-rooms',
  'project-ffe-items',
  'project-room-placements',
  'project-line-groups',
]);
const isLandingRead = (query: Query) =>
  LANDING_READS.has(String(query.queryKey[0]));

const NOT_MOVED = () => false;
/** The reader's own press or key. */
const INPUT_EVENTS = ['pointerdown', 'keydown'] as const;
/** A held pointer let go (a missed `pointerup` is caught by a buttonless move). */
const POINTER_END_EVENTS = ['pointerup', 'pointercancel', 'pointermove'] as const;

/**
 * Lands the unfolded sheet where its address stands, once its reads have
 * answered: the line (opened by id) when one is named, else the room's
 * heading, else the sheet's top. When the room no longer has the line, the
 * Spec lens says so and the landing takes the line it shows instead.
 *
 * - It waits for the sheet to take focus to its title, then lands from there.
 * - Its deadline starts only once the sheet's code and its own reads have
 *   answered (F6, F10). When it passes, the sheet lands on the room's
 *   heading, else its top.
 * - It yields to the reader (F7): once she has moved focus or scrolled since
 *   the unfold opened, it neither moves focus nor scrolls. A scroll under a
 *   held pointer (a scrollbar drag) is hers (F8); focus her own press or key
 *   brings, the title's included, is hers (F9); so is any press in the
 *   sheet, focus moved or not.
 * - The line is read as a landing starts: choosing a line re-addresses the
 *   unfold, and that is the reader's own move, not a landing.
 *
 * Returns the landing's reader-intent latch, so a sheet that mounts after
 * the reader has moved on does not take focus to its title (F5).
 */
function useSheetLanding(
  hostRef: RefObject<HTMLDivElement | null>,
  { lens, room, line }: UnfoldAddress,
): () => boolean {
  const settled = useIsFetching({ predicate: isLandingRead }) === 0;
  const settledRef = useRef(settled);
  const lineRef = useRef(line);
  const pokeRef = useRef<(settled: boolean) => void>(() => {});
  const latchRef = useRef<() => boolean>(NOT_MOVED);
  const readerHasMoved = useCallback(() => latchRef.current(), []);
  useEffect(() => {
    settledRef.current = settled;
    lineRef.current = line;
  });
  useEffect(() => {
    pokeRef.current(settled);
  }, [settled]);

  useEffect(() => {
    const found = hostRef.current;
    if (!found) return;
    const host: HTMLDivElement = found;
    const addressed = lineRef.current;
    const opener = document.activeElement;
    let readerMoved = false;
    let landing = false;
    // A pointer is held: a scroll now is the reader's (a scrollbar drag).
    let pressing = false;
    // The reader's own press or key, heard in this task.
    let readerInput = false;
    // Where the landing put focus. The sheet can take it back to its title
    // (its own landing effect re-runs, as React does in development); until
    // the wait is over, the title taking it again lands here again.
    let landedOn: Element | null = null;
    let timer: number | undefined;
    let done = false;
    const observer = new MutationObserver(() => attempt());
    const title = () =>
      host.querySelector<HTMLElement>(`[${BUILD_ROOM_TITLE_ATTR}]`);
    // Before the sheet takes focus to its title, focus is on the page or
    // still on the control that opened it.
    const waiting = () => {
      const active = document.activeElement;
      return (
        !active ||
        active === document.body ||
        (active === opener && active !== title())
      );
    };
    const yielded = () => {
      const active = document.activeElement;
      return (
        readerMoved ||
        (!waiting() && active !== title() && active !== landedOn)
      );
    };

    const landOnLine = (id: string) => {
      const row = host.querySelector<HTMLElement>(
        `[data-line-id="${CSS.escape(id)}"]`,
      );
      if (!row) return false;
      row.scrollIntoView?.({ block: 'center' });
      focusLineAct(host, id);
      return true;
    };
    const landOnRoom = () => {
      const heading = room ? roomHeading(host, room) : null;
      if (!heading) return false;
      (heading.closest('section, tbody') ?? heading).scrollIntoView?.({
        block: 'start',
      });
      heading.focus({ preventScroll: true });
      return true;
    };
    /** Lands where the address stands; `fallback` once the wait is over. */
    const land = (fallback: boolean): boolean => {
      landing = true;
      try {
        const landed = landAt(fallback);
        if (landed) landedOn = document.activeElement;
        return landed;
      } finally {
        landing = false;
      }
    };
    const landAt = (fallback: boolean): boolean => {
      if (addressed) {
        if (landOnLine(addressed)) return true;
        const shown = host.querySelector('[data-spec-line-missing]:not(:empty)')
          ? host
              .querySelector('[data-line-id] [aria-current="true"]')
              ?.closest('[data-line-id]')
              ?.getAttribute('data-line-id')
          : null;
        if (shown && landOnLine(shown)) return true;
        if (!fallback) return false;
      }
      if (room) {
        if (landOnRoom()) return true;
        if (!fallback) return false;
      }
      host.scrollIntoView?.({ block: 'start' });
      return true;
    };

    function stop() {
      done = true;
      observer.disconnect();
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('wheel', onReaderScroll);
      window.removeEventListener('touchmove', onReaderScroll);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      for (const type of INPUT_EVENTS) {
        window.removeEventListener(type, onInput, true);
      }
      for (const type of POINTER_END_EVENTS) {
        window.removeEventListener(type, onPointerEnd, true);
      }
      window.clearTimeout(timer);
      pokeRef.current = () => {};
    }
    function expire() {
      if (!done && !landedOn && !yielded()) land(true);
      stop();
    }
    function attempt() {
      if (done || !title()) return;
      if (yielded()) return stop();
      const holding = landedOn != null && document.activeElement === landedOn;
      if (!holding && !waiting()) land(false);
      // The sheet's code is here; the wait starts once its reads answer.
      if (timer === undefined && settledRef.current) {
        timer = window.setTimeout(expire, LANDING_WAIT_MS);
      }
    }
    // A read starting (a lens's first fetch can begin just after its rows'
    // container is on the page) puts the wait back until it answers.
    function onReads(settled: boolean) {
      if (settled) return attempt();
      window.clearTimeout(timer);
      timer = undefined;
    }
    // Focus going anywhere but the sheet's title (or this landing's target)
    // is the reader's own move; so is focus her own press or key brought,
    // even to the title (F9): only the sheet's own focusing is not hers.
    function onFocusIn(event: FocusEvent) {
      // This landing's own focus move is not heard as a new one.
      if (landing) return;
      if (
        readerInput ||
        (event.target !== title() && event.target !== opener)
      ) {
        readerMoved = true;
      }
      attempt();
    }
    function onReaderScroll() {
      readerMoved = true;
      stop();
    }
    function onKey(event: KeyboardEvent) {
      if (SCROLL_KEYS.has(event.key)) onReaderScroll();
    }
    function onInput(event: Event) {
      if (event.type === 'pointerdown') {
        pressing = true;
        // A press in the sheet is hers whether or not focus moves: pressing
        // the title that already holds the landing's focus brings no focusin.
        if (event.target instanceof Node && host.contains(event.target)) {
          readerMoved = true;
          return stop();
        }
      }
      readerInput = true;
      window.setTimeout(() => {
        readerInput = false;
      }, 0);
    }
    function onPointerEnd(event: Event) {
      if (event.type !== 'pointermove' || (event as PointerEvent).buttons === 0) {
        pressing = false;
      }
    }
    // The landing's own scroll, the paper's scroll anchoring or a restored
    // position move the page with no pointer held; a scrollbar drag does not.
    function onScroll() {
      if (pressing) onReaderScroll();
    }

    observer.observe(host, { childList: true, subtree: true });
    // The title taking focus is no DOM change; it is heard here, as is focus
    // the reader moves elsewhere.
    document.addEventListener('focusin', onFocusIn);
    window.addEventListener('wheel', onReaderScroll, { passive: true });
    window.addEventListener('touchmove', onReaderScroll, { passive: true });
    window.addEventListener('keydown', onKey);
    // Capture: a control that consumes its press or key still tells us.
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    for (const type of INPUT_EVENTS) {
      window.addEventListener(type, onInput, { capture: true, passive: true });
    }
    for (const type of POINTER_END_EVENTS) {
      window.addEventListener(type, onPointerEnd, { capture: true, passive: true });
    }
    pokeRef.current = onReads;
    latchRef.current = yielded;
    attempt();
    return () => {
      stop();
      latchRef.current = NOT_MOVED;
    };
  }, [hostRef, lens, room]);
  return readerHasMoved;
}
