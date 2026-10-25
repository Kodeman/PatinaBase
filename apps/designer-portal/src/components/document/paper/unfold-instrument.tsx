"use client";

/**
 * The in-place instrument (WP-01.4b, C1 §2): a dense instrument — the FF&E
 * sheet first — unfolds inside the paper and folds away to exactly where the
 * reader was.
 *
 * - Opening pushes the unfold address with `window.history.pushState`, never
 *   `router.push`, so the paper does not remount.
 * - The URL drives open and closed, so Back and Forward walk the unfold, and
 *   a reload on `?unfold=` reopens it. The address carries no act, so nothing
 *   is replayed.
 * - Closing (Esc when nothing else holds it, or "Return to the room") goes
 *   `history.back()` when the unfold pushed the entry, else `replaceState`s
 *   the unfold parameters away. Focus then returns through `return-context`.
 * - Buffered edits registered under `autosaveOwner` hold the close with a
 *   visible "Saving…" until they persist; a failed save keeps the sheet open.
 *   Back (and Forward) is held exactly like Return (story #40/#41/#44): it is
 *   cancelled, or the sheet traverses back to its entry, and it completes
 *   once the save lands. A save that finishes after a re-address, a push or
 *   an unmount navigates nowhere. Without the Navigation API, traversal
 *   is not held (legacy parity); Return/Esc and beforeunload still hold.
 *
 * The host is never `role="dialog"` or `aria-modal`: an embedded Build room
 * reads any rendered dialog as holding Esc (SQ-1819 review).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import type { BoardOwnerRef } from "@patina/types";
import { escapeIsHeld } from "@/components/document/pieces/build-room-shell";
import {
  captureReturnContext,
  isReturnContext,
  PAPER_CHAPTER_ATTR,
  restoreReturnContext,
  type ReturnContext,
  type ReturnContextInput,
} from "@/lib/document/paper/return-context";
import {
  closedUrl,
  isUuid,
  parseUnfoldSearch,
  UNFOLD_HOME_CHAPTER,
  unfoldUrl,
  type UnfoldAddress,
  type UnfoldKind,
} from "@/lib/document/paper/unfold-url";
import {
  flushBoardOwnerAutosaves,
  getProposalAutosaveSnapshot,
  isProposalAutosaveSnapshotClean,
  subscribeToProposalAutosaves,
  type ProposalAutosaveSnapshot,
} from "@/lib/proposal-autosave-registry";

/** The one key this module owns inside `history.state`. */
export const UNFOLD_HISTORY_KEY = "__patinaUnfold";
/** Fired after this module changes the URL itself (pushState fires no event). */
const UNFOLD_CHANGE = "patina:unfold-change";

interface UnfoldEntry {
  /** True when the unfold pushed this entry, so closing can go Back. */
  pushed: boolean;
  context: ReturnContext | null;
}

function stateRecord(state: unknown): Record<string, unknown> | null {
  return state && typeof state === "object"
    ? (state as Record<string, unknown>)
    : null;
}

function readEntry(state: unknown = window.history.state): UnfoldEntry | null {
  const held = stateRecord(state)?.[UNFOLD_HISTORY_KEY];
  if (!held || typeof held !== "object") return null;
  const entry = held as Partial<UnfoldEntry>;
  return {
    pushed: entry.pushed === true,
    context: isReturnContext(entry.context) ? entry.context : null,
  };
}

function entryState(entry: UnfoldEntry | null) {
  return entry ? { [UNFOLD_HISTORY_KEY]: entry } : {};
}

function locationChanged(): void {
  window.dispatchEvent(new Event(UNFOLD_CHANGE));
}

function subscribeLocation(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  window.addEventListener(UNFOLD_CHANGE, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(UNFOLD_CHANGE, listener);
  };
}

/** The entry an open sheet stands on: its address and Navigation API key. */
interface Standing {
  url: string;
  /** Its Navigation API key, which survives a replace but not a push. */
  key: string | null;
}

/**
 * Story #40/#41 — an open sheet whose pane has a write out or a field marked
 * unsaved. A Back (or Forward) that leaves its entry, to this document or
 * another, is cancelled before it happens where the Navigation API allows
 * (a traverse `navigate` event, which fires ahead of Next's popstate
 * listener). Elsewhere it is read as still standing on its entry, so no
 * render folds the sheet, and the sheet's own popstate listener traverses
 * back to the entry; that path cannot outrun Next's listener on a Back to
 * another route (#41's named residual). Either way it is held like Return.
 */
interface BackHold {
  kind: UnfoldKind;
  standing: () => Standing | null;
  /** Whether a traversal to `to` is held (it is not the one releasing). */
  holds: (to: string) => boolean;
  depart: (action: () => void) => void;
}
const backHolds = new Set<BackHold>();

/** Explicit paper departures use the mounted sheet's Return/Esc barrier too. */
export function requestUnfoldDeparture(action: () => void): void {
  // The mounted owner remains authoritative while history restores its entry;
  // the address bar may already show the folded destination.
  const hold = backHolds.values().next().value;
  if (hold) hold.depart(action);
  else action();
}

/** The slice of the Navigation API a held traversal needs. */
interface TraverseNavigateEvent extends Event {
  navigationType: string;
  destination: { url: string; index: number; key?: string };
}
interface NavigationEntryLike {
  key?: string;
  index: number;
  url: string;
}
interface NavigationLike extends EventTarget {
  currentEntry: NavigationEntryLike | null;
  entries?: () => NavigationEntryLike[];
}
function navigationApi(): NavigationLike | null {
  return (
    (window as unknown as { navigation?: NavigationLike }).navigation ?? null
  );
}

/** The session-history entry keyed `key`, where the Navigation API lists it. */
function keyedEntry(key: string | null): NavigationEntryLike | null {
  const navigation = navigationApi();
  if (!key || typeof navigation?.entries !== "function") return null;
  return navigation.entries().find((entry) => entry.key === key) ?? null;
}

/** A traversal the sheet holds, and where it goes once the save lands. */
interface HeldTraversal {
  url: string;
  /** The destination entry's key: its distance is measured on resuming. */
  key: string | null;
}

/**
 * How far to go from the standing entry to `target` now, or `null` when the
 * hold is stale: a push since replaced the standing entry or dropped the
 * destination. A relative distance is never reused across a push.
 */
function resumeDistance(
  standingKey: string | null,
  target: HeldTraversal,
): number | null {
  const here = navigationApi()?.currentEntry;
  if (!target.key || !standingKey || !here?.key) return null;
  const there = keyedEntry(target.key);
  if (here.key !== standingKey || !there) return null;
  return there.index - here.index;
}

/**
 * The standing entry a traversal to `to` (by default, the address it has
 * already reached) must not leave, or `null`.
 */
function heldBack(
  to: string = window.location.href,
  checkEntry = true,
): ({ hold: BackHold } & Standing) | null {
  // Some Navigation API implementations do not track History API pushes or
  // replaces. Same-route stale keys use no-API parity; a cancelable
  // cross-route departure still retains its mounted save barrier.
  if (checkEntry && navigationApi()?.currentEntry?.url !== window.location.href) return null;
  const { href, pathname, search } = new URL(to);
  for (const hold of backHolds) {
    const standing = hold.standing();
    if (!standing || standing.url === href) continue;
    if (checkEntry && keyedEntry(standing.key)?.url !== standing.url) continue;
    // Still unfolded on the same document: a re-address, not a leave.
    if (
      new URL(standing.url).pathname === pathname &&
      parseUnfoldSearch(new URLSearchParams(search), { canSeeMoney: true })
        ?.kind === hold.kind
    ) {
      continue;
    }
    if (!hold.holds(href)) continue;
    return { hold, ...standing };
  }
  return null;
}

const readSearch = () => {
  const held = navigationApi() ? heldBack() : null;
  return held ? new URL(held.url).search : window.location.search;
};
const serverSearch = () => "";

/**
 * Unfold `address` over the paper, remembering the place it was opened from
 * (`opener` is the control pressed). Already unfolded, as the URL says, it
 * re-addresses the same entry instead of stacking another, so one Back still
 * folds away. An entry this module did not push (a deep link or a reload)
 * stays unpushed, and takes the opener as its return place when the opener
 * stands on the paper rather than inside the sheet that folds away.
 */
export function openUnfold(
  address: UnfoldAddress,
  context: ReturnContextInput,
  opener: Element | null = document.activeElement,
): void {
  const url = unfoldUrl(window.location, address);
  const unfolded =
    parseUnfoldSearch(new URLSearchParams(window.location.search), {
      canSeeMoney: false,
    }) !== null;
  if (unfolded) {
    const onPaper = opener?.closest("[data-unfold-instrument]") ? null : opener;
    const entry: UnfoldEntry = readEntry() ?? {
      pushed: false,
      context: captureReturnContext(context, onPaper),
    };
    window.history.replaceState(entryState(entry), "", url);
  } else {
    const entry: UnfoldEntry = {
      pushed: true,
      context: captureReturnContext(context, opener),
    };
    window.history.pushState(entryState(entry), "", url);
  }
  locationChanged();
}

/** The unfold the URL names now, or `null`. */
export function useUnfoldAddress(canSeeMoney: boolean): UnfoldAddress | null {
  const search = useSyncExternalStore(
    subscribeLocation,
    readSearch,
    serverSearch,
  );
  return useMemo(
    () => parseUnfoldSearch(new URLSearchParams(search), { canSeeMoney }),
    [search, canSeeMoney],
  );
}

const NO_BUFFERS: ProposalAutosaveSnapshot = {
  dirty: false,
  flushing: false,
  error: null,
  registeredBuffers: 0,
  revision: 0,
};

function useAutosaveSnapshot(owner: BoardOwnerRef | null | undefined) {
  const kind = owner?.kind;
  const id = owner?.id;
  const subscribe = useCallback(
    (listener: () => void) =>
      kind && id
        ? subscribeToProposalAutosaves({ kind, id }, listener)
        : () => {},
    [kind, id],
  );
  const read = useCallback(
    () => (kind && id ? getProposalAutosaveSnapshot({ kind, id }) : NO_BUFFERS),
    [kind, id],
  );
  return useSyncExternalStore(subscribe, read, read);
}

/** Folds the unfold away: Back when it pushed the entry, else a replace. */
function foldAway(): void {
  if (readEntry()?.pushed) {
    window.history.back();
    return;
  }
  window.history.replaceState({}, "", closedUrl(window.location));
  locationChanged();
}

export type UnfoldNavigation = Partial<
  Pick<UnfoldAddress, "lens" | "room" | "line">
>;

export interface UnfoldRenderProps {
  address: UnfoldAddress;
  /** Asks to fold away; waits for buffered saves first. */
  close: () => void;
  /** Re-addresses the open instrument in place (no new history entry). */
  navigate: (next: UnfoldNavigation) => void;
}

export interface UnfoldInstrumentProps {
  kind?: UnfoldKind;
  /** Names the unfolded region, e.g. "FF&E schedule". */
  label: string;
  canSeeMoney: boolean;
  /** The owner whose buffered edits must land before the sheet folds away. */
  autosaveOwner?: BoardOwnerRef | null;
  /**
   * The chapter key that hosts the instrument, for the return place when the
   * entry recorded none (a deep link or a reload). Defaults to the nearest
   * enclosing `[data-paper-chapter]`, then the unfold kind's home chapter.
   */
  chapter?: string | null;
  children: (unfold: UnfoldRenderProps) => ReactNode;
}

/** The return place an entry with no recorded context folds back to. */
function addressReturnContext(
  address: UnfoldAddress,
  chapter: string | null,
): ReturnContext {
  const documentId =
    /^\/doc\/([^/]+)/.exec(window.location.pathname)?.[1] ?? "";
  return captureReturnContext(
    { documentId, chapter, room: address.room, line: address.line },
    null,
  );
}

export const UNFOLD_SAVING_MESSAGE =
  "Saving your changes before returning to the room…";
export const UNFOLD_UNSAVED_MESSAGE =
  "Your changes are not saved yet, so the sheet stays open. Check the marked field and return again.";

const ACT =
  "inline-flex min-h-11 min-w-11 items-center font-mono text-[12px] font-medium uppercase tracking-[0.06em] underline decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-ink)] aria-disabled:cursor-progress aria-disabled:no-underline";

export function UnfoldInstrument({
  kind = "pieces",
  label,
  canSeeMoney,
  autosaveOwner,
  chapter,
  children,
}: UnfoldInstrumentProps) {
  const parsed = useUnfoldAddress(canSeeMoney);
  const address = parsed?.kind === kind ? parsed : null;
  const open = address !== null;

  const snapshot = useAutosaveSnapshot(autosaveOwner);
  const ownerKind = autosaveOwner?.kind;
  const ownerId = autosaveOwner?.id;
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [returnMessage, setReturnMessage] = useState("");

  const contextRef = useRef<ReturnContext | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  // Story #41 — the traversal a held Back or Forward goes on to, and whether
  // the sheet is still traversing back to its entry.
  const destination = useRef<HeldTraversal | null>(null);
  const restoring = useRef(false);
  const resumeOnArrival = useRef(false);
  // Moves on every open, close, re-address (another line remounts the pane)
  // and unmount, so a save that finishes later can tell whether the spell
  // that asked to close or held a Back is still the current one.
  const generation = useRef(0);
  useLayoutEffect(() => {
    generation.current += 1;
    destination.current = null;
    resumeOnArrival.current = false;
    setClosing(false);
    return () => {
      generation.current += 1;
    };
  }, [address]);

  // While open, hold the entry's return context: Back leaves the entry
  // before the close is seen, and a reload brings the context back with it.
  // An entry that recorded none returns to the place its address names.
  useEffect(() => {
    if (!address) return;
    const entry = readEntry();
    const hostChapter =
      chapter ??
      sectionRef.current
        ?.closest(`[${PAPER_CHAPTER_ATTR}]`)
        ?.getAttribute(PAPER_CHAPTER_ATTR) ??
      UNFOLD_HOME_CHAPTER[address.kind];
    contextRef.current =
      entry?.context ?? addressReturnContext(address, hostChapter);
  }, [address, chapter]);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      setReturnMessage("");
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    setClosing(false);
    setCloseError(null);
    const context = contextRef.current;
    contextRef.current = null;
    if (!context) return;
    // After the paper has painted without the instrument.
    const frame = window.requestAnimationFrame(() => {
      restoreReturnContext(context, { announce: setReturnMessage });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const depart = useCallback((action: () => void) => {
    if (closing) return;
    if (!ownerKind || !ownerId || isProposalAutosaveSnapshotClean(
      getProposalAutosaveSnapshot({ kind: ownerKind, id: ownerId }),
    )) {
      action();
      return;
    }
    setClosing(true);
    setCloseError(null);
    // The edits drain whatever happens next, but the close belongs to this
    // spell: after Back, a reopen or an unmount, the late answer is dropped.
    const asked = generation.current;
    flushBoardOwnerAutosaves({ kind: ownerKind, id: ownerId }).then(
      () => {
        if (generation.current !== asked) return;
        setClosing(false);
        action();
      },
      () => {
        if (generation.current !== asked) return;
        setClosing(false);
        setCloseError(UNFOLD_UNSAVED_MESSAGE);
      },
    );
  }, [closing, ownerKind, ownerId]);
  const departRef = useRef(depart);
  departRef.current = depart;
  const close = useCallback(() => depart(foldAway), [depart]);
  // Story #40/#41 — Back (or Forward) is held exactly like Return while the
  // pane has a write out or a field marked unsaved, whether it leads within
  // this document or to another one. Where the traversal's `navigate` event
  // is cancelable it is cancelled, so nothing moves; otherwise the popstate
  // listener stops the event and traverses back to the standing entry, so
  // the history stack never changes. Once the save lands, one `history.go`
  // completes the traversal it remembered, measured from the standing entry
  // then, and both listeners let exactly that one through. A re-address, a
  // push or an unmount in between drops it. A refusal keeps the sheet open
  // on the marked field; nothing is written again.
  const standing = useRef<Standing | null>(null);
  const releasing = useRef<string | null>(null);
  useLayoutEffect(() => {
    standing.current = address
      ? {
          url: window.location.href,
          key: navigationApi()?.currentEntry?.key ?? null,
        }
      : null;
  }, [address]);

  const resume = useCallback(() => {
    const target = destination.current;
    if (!target) return;
    if (restoring.current) {
      resumeOnArrival.current = true;
      return;
    }
    destination.current = null;
    const delta = resumeDistance(standing.current?.key ?? null, target);
    if (!delta) return;
    releasing.current = target.url;
    window.history.go(delta);
  }, []);

  const holdBack = useCallback(() => {
    if (!ownerKind || !ownerId) return;
    // The held Back takes over any close already waiting: one navigation.
    const asked = (generation.current += 1);
    setClosing(true);
    setCloseError(null);
    flushBoardOwnerAutosaves({ kind: ownerKind, id: ownerId }).then(
      () => {
        if (generation.current !== asked) return;
        setClosing(false);
        resume();
      },
      () => {
        if (generation.current !== asked) return;
        setClosing(false);
        setCloseError(UNFOLD_UNSAVED_MESSAGE);
      },
    );
  }, [ownerKind, ownerId, resume]);
  const holdBackRef = useRef(holdBack);
  holdBackRef.current = holdBack;

  useEffect(() => {
    if (!open || !ownerKind || !ownerId) return;
    const owner = { kind: ownerKind, id: ownerId };
    const hold: BackHold = {
      kind,
      standing: () => standing.current,
      depart: (action) => departRef.current(action),
      holds: (to) =>
        releasing.current !== to &&
        !isProposalAutosaveSnapshotClean(getProposalAutosaveSnapshot(owner)),
    };
    // Ahead of Next's popstate listener, which on a Back to another route
    // unmounts this sheet (and its popstate listener) before that runs.
    const navigation = navigationApi();
    const onNavigate = (event: Event) => {
      const { navigationType, destination: to } =
        event as TraverseNavigateEvent;
      const from = navigation?.currentEntry?.index;
      if (navigationType !== "traverse" || !event.cancelable || from == null) {
        return;
      }
      let sameRoute = false;
      try {
        sameRoute = new URL(to.url).pathname === window.location.pathname;
      } catch {
        // An unavailable destination keeps the existing traversal behaviour.
      }
      if (heldBack(to.url, sameRoute)?.hold !== hold) return;
      event.preventDefault();
      destination.current = {
        url: to.url,
        key: to.key ?? null,
      };
      holdBackRef.current();
    };
    const onPop = (event: PopStateEvent) => {
      const released = releasing.current;
      releasing.current = null;
      if (released !== null && released === window.location.href) return;
      if (restoring.current && window.location.href === standing.current?.url) {
        // Back on the entry: Next never saw it leave, so it sees no return.
        event.stopImmediatePropagation();
        restoring.current = false;
        if (resumeOnArrival.current) {
          resumeOnArrival.current = false;
          resume();
        }
        return;
      }
      const held = heldBack();
      if (held?.hold !== hold) return;
      const here = navigation?.currentEntry;
      const from = keyedEntry(held.key);
      if (!here || !from) return;
      event.stopImmediatePropagation();
      const delta = here.index - from.index;
      destination.current = {
        url: window.location.href,
        key: here?.key ?? null,
      };
      restoring.current = true;
      window.history.go(-delta);
      holdBackRef.current();
    };
    // A Back across a browser-document boundary (the unfold was loaded or
    // reloaded at its address), a reload or a tab close fires no popstate, so
    // nothing can re-push: while a write is pending or marked, ask the browser
    // to confirm leaving. Native dialog only; a confirmed leave drops the draft.
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    let guarding = false;
    const guard = () => {
      const unsaved = !isProposalAutosaveSnapshotClean(
        getProposalAutosaveSnapshot(owner),
      );
      if (unsaved === guarding) return;
      guarding = unsaved;
      if (unsaved) window.addEventListener("beforeunload", onUnload);
      else window.removeEventListener("beforeunload", onUnload);
    };
    guard();
    const unsubscribe = subscribeToProposalAutosaves(owner, guard);
    backHolds.add(hold);
    if (navigation) {
      navigation.addEventListener("navigate", onNavigate);
      window.addEventListener("popstate", onPop, { capture: true });
    }
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", onUnload);
      backHolds.delete(hold);
      navigation?.removeEventListener("navigate", onNavigate);
      window.removeEventListener("popstate", onPop, { capture: true });
      generation.current += 1;
      destination.current = null;
      releasing.current = null;
      restoring.current = false;
      resumeOnArrival.current = false;
    };
  }, [open, ownerKind, ownerId, kind, resume]);

  const navigate = useCallback(
    (next: UnfoldNavigation) => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("unfold") !== kind) return;
      if (next.lens) params.set("lens", next.lens);
      if (next.room !== undefined) {
        const moved = next.room !== (params.get("room") || null);
        if (next.room) params.set("room", next.room);
        else params.delete("room");
        if (moved && next.line === undefined) params.delete("line");
      }
      if (next.line !== undefined) {
        if (isUuid(next.line)) params.set("line", next.line);
        else params.delete("line");
      }
      const { pathname, hash } = window.location;
      window.history.replaceState(
        entryState(readEntry()),
        "",
        `${pathname}?${params.toString()}${hash}`,
      );
      locationChanged();
    },
    [kind],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      // The embedded sheet's own guard: any rendered holder in the document
      // holds Esc, not only the target's ancestors.
      if (event.key !== "Escape" || escapeIsHeld(event.nativeEvent, true)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      close();
    },
    [close],
  );

  const announcer = (
    <p role="status" aria-live="polite" className="sr-only" data-unfold-return>
      {returnMessage}
    </p>
  );

  if (!address) return announcer;

  return (
    <>
      {announcer}
      <section
        ref={sectionRef}
        aria-label={label}
        data-unfold-instrument={kind}
        data-unfold-state={closing ? "saving" : "open"}
        aria-busy={closing || undefined}
        onKeyDown={onKeyDown}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex min-h-11 flex-wrap items-center justify-end gap-x-4 border-b border-[var(--sheet-rule-strong)] bg-[var(--sheet-head)] px-4 text-[var(--sheet-ink)] md:px-6">
          <p
            role="status"
            aria-live="polite"
            className="text-[12px] leading-[1.4] text-[var(--sheet-ink)]"
          >
            {closing ? UNFOLD_SAVING_MESSAGE : ""}
          </p>
          {closeError ? (
            <p role="alert" className="text-[12px] leading-[1.4]">
              {closeError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={close}
            aria-disabled={closing || undefined}
            className={ACT}
          >
            <span aria-hidden="true">←&nbsp;</span>Return to the room
          </button>
        </div>
        {children({ address, close, navigate })}
      </section>
    </>
  );
}
