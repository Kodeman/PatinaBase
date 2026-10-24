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
 * with `expectedRowVersion`). The Spec lens registers those saves under this
 * chapter's `autosaveOwner`, so Return to the room waits for them, and a
 * failed one keeps the sheet open with its alert and the typed value. The
 * `/doc/[id]/pieces` route keeps resolving under both renderers.
 */

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

/** How long a landing waits for the sheet's reads to answer. */
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
    (next: BuildRoomState) => navigate({ lens: next.lens, room: next.room }),
    [navigate],
  );
  useSheetLanding(hostRef, { ...address, lens });
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
        />
      </Suspense>
    </div>
  );
}

/**
 * Lands the unfolded sheet where its address stands, once its reads have
 * answered: the line (opened by id) when one is named, else the room's
 * heading, else the sheet's top. Focus the reader has already moved stays
 * where she put it.
 */
function useSheetLanding(
  hostRef: RefObject<HTMLDivElement | null>,
  { lens, room, line }: UnfoldAddress,
): void {
  useEffect(() => {
    const found = hostRef.current;
    if (!found) return;
    const host: HTMLDivElement = found;
    const title = () =>
      host.querySelector<HTMLElement>(`[${BUILD_ROOM_TITLE_ATTR}]`);
    // Focus the reader has moved on her own stays where she put it.
    const free = () => document.activeElement === title();
    const land = (): boolean => {
      if (!title()) return false;
      // The sheet moves focus to its title as it lands (BuildRoomShell), in
      // an effect that can run after the rows are already on the page. Land
      // once that has happened, or the title takes the line's focus back.
      if (document.activeElement === document.body) return false;
      if (line) {
        const row = host.querySelector<HTMLElement>(
          `[data-line-id="${CSS.escape(line)}"]`,
        );
        if (!row) return false;
        row.scrollIntoView?.({ block: 'center' });
        if (free()) focusLineAct(host, line);
        return true;
      }
      if (room) {
        const heading = roomHeading(host, room);
        if (!heading) return false;
        (heading.closest('section, tbody') ?? heading).scrollIntoView?.({
          block: 'start',
        });
        if (free()) heading.focus({ preventScroll: true });
        return true;
      }
      host.scrollIntoView?.({ block: 'start' });
      return true;
    };
    if (land()) return;
    const retry = () => {
      if (land()) stop();
    };
    const observer = new MutationObserver(retry);
    const timer = window.setTimeout(stop, LANDING_WAIT_MS);
    function stop() {
      observer.disconnect();
      host.removeEventListener('focusin', retry);
      window.clearTimeout(timer);
    }
    observer.observe(host, { childList: true, subtree: true });
    // The title taking focus is no DOM change; it is heard here.
    host.addEventListener('focusin', retry);
    return stop;
  }, [hostRef, lens, room, line]);
}

