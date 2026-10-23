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
 *   Back is never blocked: a save that finishes after Back, a reopen or an
 *   unmount still lands, but no longer closes anything.
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

function readEntry(): UnfoldEntry | null {
  const state = window.history.state as Record<string, unknown> | null;
  const held = state?.[UNFOLD_HISTORY_KEY];
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

const readSearch = () => window.location.search;
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
  // Moves on every open, close and unmount, so a save that finishes later can
  // tell whether the spell that asked to close is still the current one.
  const generation = useRef(0);
  useLayoutEffect(() => {
    generation.current += 1;
    return () => {
      generation.current += 1;
    };
  }, [open]);

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

  const close = useCallback(() => {
    if (closing) return;
    if (!ownerKind || !ownerId || isProposalAutosaveSnapshotClean(snapshot)) {
      foldAway();
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
        foldAway();
      },
      () => {
        if (generation.current !== asked) return;
        setClosing(false);
        setCloseError(UNFOLD_UNSAVED_MESSAGE);
      },
    );
  }, [closing, ownerKind, ownerId, snapshot]);

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
