'use client';

/**
 * The lens's density observer — what must exist ahead of the reader, and what
 * she has already passed.
 *
 * One `IntersectionObserver` over the paper's region roots, one threshold, ONE
 * DIRECTION. A root is PROMOTED when its top comes within `LENS_LOOKAHEAD_PX`
 * of the frame's bottom edge (the observer's only rootMargin), and it is never
 * demoted: the observer stops watching a root the moment it commits. There is
 * no hysteresis pair and no second band, because there is no event in the other
 * direction to rule — everything above the reader is already mounted and stays
 * mounted.
 *
 * The commit is gated on the L-9 settle (velocity under
 * `LENS_SETTLE_VELOCITY_PX` per frame for `LENS_SETTLE_MS`), so a fling opens
 * nothing mid-flight: intersecting roots buffer, and the whole buffer commits
 * together, in paper order, at the landing.
 *
 * Every write is imperative, inside the scroll's single `requestAnimationFrame`
 * — `data-density` and `data-passed` on the root, `data-lens-settled` on the
 * shell. React re-renders nothing on a scroll; the only React work is the one
 * region whose body subscribes through `useLensDensityStore` and moves from
 * `quiet` to `full`. Nothing here schedules a transition — the word itself is a
 * tripwire the wave greps for, so it is not written even in a comment.
 *
 * `data-passed` is written once its root's bottom passes above the frame's top
 * and is NEVER removed — it is what `content-visibility: auto` keys on, and a
 * region that could lose it would be a region whose height could change above
 * the reader. Passing does not promote: a region above the frame growing from
 * its reserve to its full height is exactly the layout shift H5 forbids.
 *
 * Attachment is a `MutationObserver` on `document.body`, not the running
 * index's retry window: regions arrive as their own queries settle, and a
 * subscription cannot miss one the way a lapsing retry can. The body, not the
 * paper, because the paper itself is replaced whenever the document re-enters
 * `loading` (W4-C6). Discovery is also
 * where a root that is ALREADY at or above the lookahead line is answered — a
 * deep landing, a restored scroll — because a bottom-only rootMargin never
 * fires for one. The first pass runs from a `useLayoutEffect`, so the markup
 * hydration paints has the in-frame regions full and there is no quiet→full
 * flash on the first screen.
 *
 * That pass waits for the paper to RESOLVE (D-B46). Measuring a paper whose
 * bodies are still loading measures a fiction: on a cold load the first five
 * roots mount into a ~2,600px skeleton, so stops that settle 7,000–9,000px down
 * are inside `innerHeight + 240` at that instant, and one direction means the
 * lens can never take those promotions back. Resolved means no query is
 * fetching AND `scrollHeight` has held for three frames — or, if that never
 * comes, 3,000ms after mount against whatever is laid out, so the lens cannot
 * hang quiet. Until then discovery observes and orders roots but promotes
 * nothing, and crossings buffer; a press still promotes at once, because a
 * press is the reader acting rather than the lens guessing.
 *
 * The store is module-level rather than a context because the hook is called
 * once, at the page's root, while the bodies that listen are several levels
 * down inside components the page composes but does not wrap.
 */

import {
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import type { RefObject } from 'react';
import { flushSync } from 'react-dom';
import { QueryClient, QueryClientContext } from '@tanstack/react-query';
import {
  LENS_LOOKAHEAD_PX,
  LENS_RESOLVE_MAX_MS,
  LENS_RESOLVE_STABLE_FRAMES,
  LENS_SETTLE_MS,
  LENS_SETTLE_VELOCITY_PX,
} from '@/lib/document/lens-constants';
import type { DocumentIndexKey } from '@/lib/document/document-index';
import type { RegionDensity } from '@/components/document/region/use-region-fold';

const PAPER_SELECTOR = '[data-document-paper]';
const REGION_SELECTOR = '[data-index-region]';
const SHELL_SELECTOR = '[data-document-shell]';
const RESOLVED_ATTRIBUTE = 'data-lens-resolved';
/**
 * The design lead's own alternative mechanism for defect 1, in the DOM: "defer
 * the initial commit until the region's loading register is gone". Measured on
 * the seeded long paper, the fetch signal alone is not enough — the readiness
 * queries are DEPENDENT (they fire only once the FF&E items resolve), so
 * `isFetching` returns to 0 in the lull between waves while the paper is still
 * a 2,163px skeleton, and three stable frames pass inside that lull. A body
 * that is still printing its loading register is a body whose height is not
 * its own yet, whatever the query count says.
 */
export const LOADING_SELECTOR = '[aria-busy="true"], .animate-pulse';

/** Never mounted, never fetching: the count it reports is 0 forever. */
const STANDBY_CLIENT = new QueryClient();


declare global {
  interface Window {
    /** Resolves on the next L-9 settle, immediately when already settled. The
     *  e2e lens specs await it instead of a timeout, and they run against the
     *  shipped build — so it is installed unconditionally. */
    __lensSettled?: () => Promise<true>;
  }
}

/* ── the store ─────────────────────────────────────────────────────────────
   What the lens has said about each region, and who is listening. A region is
   in `promotedKeys` or it is not; the lens never says `quiet`, because saying
   it would DEMOTE a region whose own data opened it full. Silence (`null`) is
   how the lens leaves the fold's other three voices standing. */

const promotedKeys = new Set<string>();
const listeners = new Map<string, Set<() => void>>();

function notify(region: string): void {
  const set = listeners.get(region);
  if (!set) return;
  for (const listener of Array.from(set)) listener();
}

function subscribeDensity(region: string, onChange: () => void): () => void {
  let set = listeners.get(region);
  if (!set) {
    set = new Set();
    listeners.set(region, set);
  }
  set.add(onChange);
  return () => {
    set?.delete(onChange);
    if (set && set.size === 0) listeners.delete(region);
  };
}

/** W4-C9 — the ONLY thing `__setDensityForTest` writes, and the only branch it
 *  costs the shipped path. The fifteen region suites used to `jest.mock` the
 *  module away, replacing a two-slot hook (`useCallback` +
 *  `useSyncExternalStore`) with a zero-slot arrow function: a body that called
 *  `useLensDensityStore` after an early return or inside a branch would have
 *  broken React's hook-order invariant in production while every one of those
 *  suites stayed green — which is exactly the class of bug C-8 asks to be
 *  guarded against ("hook-order safety in every branch, esp. `care-band.tsx`'s
 *  five branches"). With the real hook running under the real store, a
 *  conditional call throws where the suite can see it. `undefined` is "not
 *  under test", which is what production always is. */
let testDensity: RegionDensity | null | undefined;

function densityFor(region: string): RegionDensity | null {
  if (testDensity !== undefined) return testDensity;
  return promotedKeys.has(region) ? 'full' : null;
}

/**
 * Test-only. Puts every region at one density and tells every listener, so a
 * suite can drive the fold's fourth voice WITHOUT mocking the hook away. Pass
 * `undefined` to hand the store back to the observer.
 */
export function __setDensityForTest(
  density: RegionDensity | null | undefined,
): void {
  testDensity = density;
  for (const region of Array.from(listeners.keys())) notify(region);
}

/** The lens has left the paper. Cleared without notifying: the only caller is
 *  the hook's own teardown, and every listener is a body coming down with it. */
function clearStore(): void {
  // W4-C13: the invariant is "every store mutation notifies". Under
  // StrictMode's dev double-invoke this cleanup runs while subscriber bodies
  // are still mounted, and a silent clear changes their `useSyncExternalStore`
  // snapshot with nothing to tell them so.
  const cleared = Array.from(promotedKeys);
  promotedKeys.clear();
  for (const region of cleared) notify(region);
}

/**
 * The lens's reading of one region, for the fold hook's fourth voice. `'full'`
 * once the lens has promoted it, `null` while the lens has nothing to say —
 * never `'quiet'`, so the reading can only ever move a region one way.
 */
export function useLensDensityStore(region: string): RegionDensity | null {
  const subscribe = useCallback(
    (onChange: () => void) => subscribeDensity(region, onChange),
    [region],
  );
  return useSyncExternalStore(
    subscribe,
    () => densityFor(region),
    () => null,
  );
}

export interface LensDensityApi {
  /** L-10: before a press scrolls, every region from the top of the paper
   *  through the target commits in ONE write, so the target's y is computed
   *  after the last height it could have moved. */
  forceFullThrough: (key: DocumentIndexKey) => void;
  /** The L-9 settle, as a promise. */
  settled: () => Promise<true>;
  subscribe: (region: string, onChange: () => void) => () => void;
  getDensity: (region: string) => RegionDensity | null;
  /** D-B19: while frozen, crossings keep buffering and nothing commits. The
   *  settle, `data-passed` and a press all carry on. */
  freeze: (frozen: boolean) => void;
}

export interface UseLensDensityOptions {
  /** OD-4's fallback path: with the lens off, every root is written `full` on
   *  arrival and no intersection observer, scroll listener or timer exists. */
  enabled?: boolean;
}

export function useLensDensity(
  paperRef?: RefObject<HTMLElement | null> | null,
  { enabled = true }: UseLensDensityOptions = {},
): LensDensityApi {
  const forceRef = useRef<(key: DocumentIndexKey) => void>(() => {});
  const settledRef = useRef<() => Promise<true>>(() => Promise.resolve(true));
  const freezeRef = useRef<(frozen: boolean) => void>(() => {});

  // D-B46 — the resolution gate's first half. Read through a ref because the
  // sampler runs in a `requestAnimationFrame` inside an effect that must not
  // re-run when the count changes: re-running would tear down the observers
  // and lose every buffered crossing on each query settling.
  //
  // W4F3-06: read through the cache's own subscription, never `useIsFetching`.
  // That hook re-renders the whole document page on EVERY query in the app
  // starting or finishing — a mood-board thumbnail, a header count — to feed a
  // number only a `requestAnimationFrame` ever reads. The cache subscription
  // costs no render at all, and it needs no list of the paper's query keys to
  // stay honest.
  //
  // The client comes from context rather than a hook lookup, which THROWS
  // where there is no provider: the lens attaches unconditionally, including
  // on the paper's own page suites, which mock every data hook and set up no
  // client, and a gate that crashed the page it was protecting would cost more
  // than the defect. With no provider the standby client reads 0 forever and
  // the paper's own height and registers carry the gate alone.
  const client = useContext(QueryClientContext) ?? STANDBY_CLIENT;
  const fetchingRef = useRef(0);
  useLayoutEffect(() => {
    const read = () => {
      fetchingRef.current = client.isFetching();
    };
    read();
    return client.getQueryCache().subscribe(read);
  }, [client]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const observed = new Map<HTMLElement, string>();
    const committed = new Set<HTMLElement>();
    const passed = new Set<HTMLElement>();
    const pending = new Set<HTMLElement>();
    /** Paper order — `querySelectorAll` is document order, which is the order
     *  the reader meets them, which is the order a buffered commit takes. */
    let ordered: HTMLElement[] = [];

    let intersection: IntersectionObserver | null = null;
    let mutation: MutationObserver | null = null;

    let discoverQueued = false;
    let frameQueued = false;
    let scrollQueued = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = true;
    /** When the last frame of 40px or more arrived. The gate measures from it,
     *  not from the last frame of any speed. */
    let lastFastAt = 0;
    let lastY = window.scrollY;
    let waiting: Array<(reason?: Error) => void> = [];
    let stopped = false;
    let frozen = false;
    /** D-B46 — with the lens off there is nothing to wait for: OD-4's fallback
     *  writes every root `full` on arrival. */
    let resolved = !enabled;
    let stableFrames = 0;
    let lastHeight = -1;
    /** A `requestAnimationFrame` is not always a frame: suites that stub it to
     *  run its callback synchronously (`paper-order.test.tsx`) turn a chain
     *  that waits on wall-clock time into recursion. Depth is capped at the few
     *  frames the gate actually needs — enough for a stable paper to resolve
     *  where frames cost nothing, and no further, because deeper than that is
     *  not time passing. The wall-clock deadline remains the ONE clock, which
     *  is also the right answer for a background tab whose frames are
     *  throttled to a stop. */
    let syncDepth = 0;
    const MAX_SYNC_DEPTH = LENS_RESOLVE_STABLE_FRAMES + 2;
    let resolveFrame: number | null = null;
    let resolveDeadline: ReturnType<typeof setTimeout> | null = null;
    /** W4F3-01 — the paper the deadline is running for. The clock cannot start
     *  before there is a paper to time: armed at mount it would expire while
     *  the document was still compiling or its first query still out, latch
     *  `resolved` with nothing laid out, and then promote every root the
     *  MutationObserver later found against the skeleton it mounted into —
     *  the lead's defect, reached by the fallback that exists to prevent it. */
    let deadlineFor: HTMLElement | null = null;
    /** W4F3-04 — the paper resolution was decided on. `<main data-document-paper>`
     *  is REPLACED, not refilled, when the page re-suspends, and a verdict about
     *  a detached element cannot govern its successor. */
    let resolvedPaper: HTMLElement | null = null;

    const resolvePaper = (): HTMLElement | null => {
      const held = paperRef?.current ?? null;
      if (held) {
        if (held.matches(PAPER_SELECTOR)) return held;
        const inner = held.querySelector<HTMLElement>(PAPER_SELECTOR);
        if (inner) return inner;
        const outer = held.closest<HTMLElement>(PAPER_SELECTOR);
        if (outer) return outer;
      }
      return document.querySelector<HTMLElement>(PAPER_SELECTOR);
    };

    const writeSettled = (next: boolean): void => {
      settled = next;
      document
        .querySelector(SHELL_SELECTOR)
        ?.setAttribute('data-lens-settled', next ? 'true' : 'false');
    };

    /** W4-C12: `settled` resolves the waiters; `stopped` REJECTS them. A
     *  waiter resolved by a teardown reports a settle that never happened, and
     *  an e2e wait that straddles a navigation would read it as one. */
    const releaseWaiting = (reason?: Error): void => {
      const held = waiting;
      waiting = [];
      for (const settleWaiter of held) settleWaiter(reason);
    };

    const promote = (root: HTMLElement): void => {
      pending.delete(root);
      if (committed.has(root)) return;
      committed.add(root);
      root.setAttribute('data-density', 'full');
      intersection?.unobserve(root);
      const key = observed.get(root);
      if (key && !promotedKeys.has(key)) {
        promotedKeys.add(key);
        notify(key);
      }
    };

    const commitPending = (): void => {
      // D-B46: a crossing during the load is a real crossing — it buffers, and
      // it lands with everything else the moment the paper has a height.
      if (!resolved || frozen || pending.size === 0) return;
      // Position is the test, always measured at the moment of the write. An
      // `IntersectionObserver` entry is queued at the end of the frame that
      // computed it, so an entry can arrive AFTER the paper it was measured
      // against has gone: on the seeded long paper the skeleton put all six
      // roots inside the lookahead, and those entries were still landing when
      // the paper reached 10,636px — promoting `money` at 7,691 and `care` at
      // 8,794 off a reading of a page that no longer existed. A root that no
      // longer stands at the line goes back to waiting; it is still observed,
      // so the observer will say so again when she reaches it.
      for (const root of ordered) {
        if (pending.has(root) && withinLookahead(root)) promote(root);
      }
      // A root that left the paper between crossing and settling is no longer
      // in `ordered`; it has nothing left to be written to.
      pending.clear();
    };

    /** The L-4 line: the root's top is at or above 240px below the frame. */
    const withinLookahead = (root: HTMLElement): boolean =>
      root.getBoundingClientRect().top <=
      window.innerHeight + LENS_LOOKAHEAD_PX;

    const markPassed = (): void => {
      // D-B17's measurement is literal: with the lens off, `data-passed` is not
      // written (W4-C14). Nothing reads it there — every root is `full` on
      // arrival — and writing it would hand `content-visibility: auto` to a
      // paper the lens is not managing.
      if (!enabled) return;
      for (const root of ordered) {
        if (passed.has(root)) continue;
        // W4F3-09 / D-B16(ii): every `[data-passed]` root is `full`. A quiet
        // root that drifted above the frame during the load would otherwise
        // take the mark and hold it forever — the attribute is never removed —
        // and the invariant W4-L4 asserts would be false on the state the lens
        // itself produced. It is not lost: the root is still observed, and the
        // commit re-measures, so passing above the frame promotes it and the
        // mark follows on the next frame.
        if (!committed.has(root)) continue;
        if (root.getBoundingClientRect().bottom >= 0) continue;
        passed.add(root);
        root.setAttribute('data-passed', '');
      }
    };

    const writeResolved = (): void => {
      const shell = document.querySelector(SHELL_SELECTOR);
      if (shell && !shell.hasAttribute(RESOLVED_ATTRIBUTE)) {
        shell.setAttribute(RESOLVED_ATTRIBUTE, 'true');
      }
    };

    /** D-B46 (3) — the first pass, in the frame the paper resolved in: exactly
     *  D-B15(c)'s, now against a paper that has its real height, then the
     *  buffer that scrolling filled while it was loading. */
    const markResolved = (): void => {
      // `typeof window` is the torn-down environment, not a browser state: the
      // gate outlives a tree that was never unmounted (a suite that renders the
      // paper and ends), and both the sampler's frame and the deadline would
      // otherwise fire into a document that no longer exists.
      if (stopped || resolved || typeof window === 'undefined') return;
      // W4F3-01: a deadline that fires with no paper resolves nothing. It
      // releases its own clock and leaves the sampler running, so the gate is
      // decided by the paper that eventually arrives rather than by its
      // absence — and the cascade below always measures the CURRENT paper.
      const paper = resolvePaper();
      if (!paper) {
        resolveDeadline = null;
        deadlineFor = null;
        return;
      }
      resolved = true;
      resolvedPaper = paper;
      if (resolveFrame !== null) {
        window.cancelAnimationFrame(resolveFrame);
        resolveFrame = null;
      }
      if (resolveDeadline) {
        clearTimeout(resolveDeadline);
        resolveDeadline = null;
      }
      writeResolved();
      // ONE AT A TIME, re-measured after each, because the paper's geometry is
      // a function of this pass's own decisions. Measured on the seeded long
      // paper: at resolution every root stands at its quiet reserve, so all six
      // are inside the lookahead of a 2,163px paper and a single-measurement
      // pass promotes all six — `money` at what becomes 7,715 and `care` at
      // 8,817. Promoting `approvals` alone moves `schedule` to 964 (still at
      // the line, so it opens too) and that moves `ffe` to 1,910, which is
      // past it. That cascade is the lead's acceptance map, and it only exists
      // if each promotion is laid out before the next root is measured —
      // `flushSync` is what makes the body's real height exist in time to be
      // measured, the same reason the press path uses it (D-B18).
      for (const root of ordered) {
        // W4F3-05: each `flushSync` renders a region body, and a body that
        // throws (or a navigation that lands mid-cascade) can tear this hook
        // down between steps. Every remaining measurement would then be taken
        // against a document the lens has already left.
        if (stopped) return;
        if (committed.has(root)) continue;
        if (!withinLookahead(root)) break;
        flushSync(() => promote(root));
      }
      // Then the buffer — which `commitPending` re-measures, so what she
      // crossed while the paper loaded lands, and what merely LOOKED crossed
      // against the skeleton does not. Measured: on the seeded long paper's
      // 2,163px skeleton all six roots stand at their quiet reserve inside the
      // lookahead, so `onIntersect` fired for every one of them; a blind drain
      // promotes exactly what waiting refused.
      commitPending();
      // And the marks these promotions have just made eligible (W4F3-09 holds
      // `data-passed` back until a root is open). Nothing else would sweep
      // them on a deep-landed load: no scroll, no crossing, no mutation.
      markPassed();
    };

    const sampleResolution = (): void => {
      resolveFrame = null;
      if (stopped || resolved || typeof window === 'undefined') return;
      const paper = resolvePaper();
      const height = paper ? paper.scrollHeight : 0;

      // W4F3-01 — the deadline starts at the first frame that HAS a paper, and
      // restarts if that paper is replaced. Before then there is nothing for a
      // clock to be a fallback for. Existence, not height: the height is the
      // stability half's business, and an environment with no layout at all
      // (jsdom, where every `scrollHeight` is 0) would otherwise never arm a
      // clock or resolve — while a real paper that sits at 0 for three frames
      // is held by the other two conditions, its queries being in flight and
      // its registers still printing.
      if (!paper) {
        if (resolveDeadline) clearTimeout(resolveDeadline);
        resolveDeadline = null;
        deadlineFor = null;
        stableFrames = 0;
        lastHeight = -1;
      } else if (deadlineFor !== paper) {
        if (resolveDeadline) clearTimeout(resolveDeadline);
        deadlineFor = paper;
        resolveDeadline = setTimeout(markResolved, LENS_RESOLVE_MAX_MS);
      }

      const loading = paper ? paper.querySelector(LOADING_SELECTOR) !== null : true;
      // A paper with no height yet is not a paper that has settled at zero —
      // it is one whose bodies have not arrived. The deadline covers the case
      // where they never do.
      const held =
        fetchingRef.current === 0 && !loading && height === lastHeight;
      lastHeight = height;
      stableFrames = held ? stableFrames + 1 : 0;
      if (stableFrames >= LENS_RESOLVE_STABLE_FRAMES) {
        markResolved();
        return;
      }
      if (syncDepth >= MAX_SYNC_DEPTH) return;
      syncDepth += 1;
      try {
        resolveFrame = window.requestAnimationFrame(sampleResolution);
      } finally {
        syncDepth -= 1;
      }
    };

    const runFrame = (): void => {
      frameQueued = false;
      if (stopped) return;
      markPassed();
      if (settled) commitPending();
    };

    const queueFrame = (): void => {
      if (frameQueued || stopped) return;
      frameQueued = true;
      window.requestAnimationFrame(runFrame);
    };

    /** L-9, as D-B32 restates it: settled iff no frame of
     *  `LENS_SETTLE_VELOCITY_PX` or more has arrived in the trailing
     *  `LENS_SETTLE_MS`. The timer fires at the earliest moment that COULD be
     *  true and re-arms for the remainder when a later fast frame has moved
     *  the deadline. */
    const onSettleTimer = (): void => {
      settleTimer = null;
      if (stopped) return;
      const since = Date.now() - lastFastAt;
      if (since >= LENS_SETTLE_MS) {
        settle();
        return;
      }
      settleTimer = setTimeout(onSettleTimer, LENS_SETTLE_MS - since);
    };

    const settle = (): void => {
      settleTimer = null;
      if (stopped) return;
      writeSettled(true);
      markPassed();
      commitPending();
      releaseWaiting();
    };

    const runScrollFrame = (): void => {
      scrollQueued = false;
      if (stopped) return;
      const y = window.scrollY;
      const travelled = Math.abs(y - lastY);
      lastY = y;
      // A FAST frame opens the window and stamps it; the timer is armed on that
      // same frame, which is what closes the deadlock — a programmatic jump
      // (`window.scrollTo`, a restored offset, a press under reduced motion) is
      // exactly ONE frame, always over the gate, and arming only on a later
      // under-gate frame left it unsettled forever with `commitPending()` and
      // `__lensSettled()` behind it. A SLOW frame writes nothing while settled:
      // a continuous trackpad drift is every frame under the gate, and a gate
      // that waited for it to stop would hold back the very promotions L-4
      // exists to make ahead of her.
      if (travelled >= LENS_SETTLE_VELOCITY_PX) {
        lastFastAt = Date.now();
        if (settled) writeSettled(false);
      }
      if (!settled && settleTimer === null) {
        settleTimer = setTimeout(onSettleTimer, LENS_SETTLE_MS);
      }
      markPassed();
      if (settled) commitPending();
    };

    const onScroll = (): void => {
      if (scrollQueued || stopped) return;
      scrollQueued = true;
      window.requestAnimationFrame(runScrollFrame);
    };

    const onIntersect: IntersectionObserverCallback = (entries) => {
      let added = false;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const root = entry.target as HTMLElement;
        if (committed.has(root)) continue;
        pending.add(root);
        added = true;
      }
      // A callback carrying only leaving entries has nothing to commit.
      if (added) queueFrame();
    };

    const discover = (): void => {
      discoverQueued = false;
      if (stopped) return;

      const paper = resolvePaper();

      // The hook attaches above the page's early returns, so on the first pass
      // there is often no shell yet to carry the state. Discovery is where it
      // arrives, and the DOM table promises the attribute is always there —
      // `e2e/helpers/lens.ts` keys its first tier on its presence, so an absent
      // one silently demotes every spec to the `__lensSettled()` tier.
      const shell = document.querySelector(SHELL_SELECTOR);
      if (shell && !shell.hasAttribute('data-lens-settled')) writeSettled(settled);

      // W4F3-04: the paper is REPLACED when the page re-suspends (a refetch, a
      // section change, an error→retry), and a verdict reached about the old
      // element says nothing about the new one — whose bodies are, again, still
      // arriving. The gate re-arms and the whole sequence runs for the paper
      // actually on screen.
      if (enabled && resolved && resolvedPaper && resolvedPaper !== paper) {
        resolved = false;
        resolvedPaper = null;
        deadlineFor = null;
        stableFrames = 0;
        lastHeight = -1;
        document
          .querySelector(SHELL_SELECTOR)
          ?.removeAttribute(RESOLVED_ATTRIBUTE);
        if (resolveFrame === null) {
          resolveFrame = window.requestAnimationFrame(sampleResolution);
        }
      }
      if (enabled && resolved) writeResolved();

      const found = paper
        ? Array.from(paper.querySelectorAll<HTMLElement>(REGION_SELECTOR))
        : [];
      ordered = found;

      // W4-C10: `promotedKeys` is module-level and outlives any one root, so a
      // key whose last root has left the paper has to leave with it. Without
      // this, a section switch — `paperRegionsForSection` gives a different
      // region set per section — mounts fresh roots under keys the previous
      // section's walk had promoted, and every one of them would render `full`
      // at first paint however far below the frame it sits.
      const stillClaimed = new Set(
        found.map((root) => root.getAttribute('data-index-region') ?? ''),
      );
      for (const root of Array.from(observed.keys())) {
        if (root.isConnected) continue;
        const key = observed.get(root) ?? '';
        observed.delete(root);
        committed.delete(root);
        passed.delete(root);
        pending.delete(root);
        intersection?.unobserve(root);
        if (!stillClaimed.has(key) && promotedKeys.delete(key)) notify(key);
      }

      for (const root of found) {
        // The store is keyed on untrusted DOM: an empty `data-index-region`
        // would be stored under `''` and notified on. `document-index.ts`
        // never emits one, so a root that carries one is not a region.
        const key = root.getAttribute('data-index-region') ?? '';
        if (!key) continue;
        observed.set(root, key);
        if (committed.has(root)) continue;
        // Two roots arrive already owed a body (D-B16): one discovered at or
        // above the lookahead line — a deep landing, a restored scroll, a query
        // that settled after the reader passed its slot, and a root React
        // re-created under a key the lens promoted before, which is by
        // definition where its predecessor was — and, with the lens off, all of
        // them. A bottom-only rootMargin never fires for anything above the
        // frame, so discovery is the only place they can be answered; the
        // reserve and the body arrive in the same commit, so no pixel she has
        // already read moves.
        //
        // W4-C10: position is the WHOLE test. A bare `promotedKeys.has(key)`
        // arm promoted on the key alone, which is a claim about a root that no
        // longer exists — see the purge above.
        // D-B46: before the paper resolves this arm is closed — the root is
        // observed and ordered like any other, and the resolution pass will
        // measure it against a paper that has a height. After resolution it is
        // D-B16 unchanged, which is what answers a late root the bottom-only
        // rootMargin can never fire for.
        if (!enabled || (resolved && withinLookahead(root))) {
          promote(root);
          continue;
        }
        intersection?.observe(root);
      }

      markPassed();
      if (settled) commitPending();
    };

    const queueDiscover = (): void => {
      if (discoverQueued || stopped) return;
      discoverQueued = true;
      window.requestAnimationFrame(discover);
    };

    if (enabled && typeof IntersectionObserver !== 'undefined') {
      intersection = new IntersectionObserver(onIntersect, {
        root: null,
        rootMargin: `0px 0px ${LENS_LOOKAHEAD_PX}px 0px`,
        threshold: 0,
      });
    }

    // Discovery outlives the lens's own switch: with `enabled` false a region
    // that mounts late still has to be written `full`, or OD-4's fallback path
    // leaves it quiet forever.
    if (typeof MutationObserver !== 'undefined') {
      // W4-C6: the watch stays on `document.body` for the hook's whole life and
      // is never retargeted to the paper. The paper is REPLACED, not merely
      // filled: `resolutionState` flipping back to `loading` (a refetch, a
      // section change that re-suspends, an error→retry) unmounts `<main
      // data-document-paper>` and React mounts a new element in its place. A
      // watch that had narrowed to the old paper would be sitting on a detached
      // node — the mutation that created the replacement lands on the shell,
      // which it no longer observes — and discovery would never run again for
      // the rest of the page's life. Body/subtree strictly contains
      // paper/subtree, so nothing that used to queue a discovery stops doing
      // so, and `queueDiscover` is rAF-debounced, which caps the extra churn at
      // one `discover()` per frame however much of the app moves.
      mutation = new MutationObserver(queueDiscover);
      mutation.observe(document.body, { childList: true, subtree: true });
    }

    if (enabled) {
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    writeSettled(true);
    discover();

    // The deadline is armed by the sampler's first frame that finds a laid-out
    // paper (W4F3-01), never here.
    if (enabled) {
      resolveFrame = window.requestAnimationFrame(sampleResolution);
    }

    forceRef.current = (key: DocumentIndexKey) => {
      // D-B18: the press reads the target's y two frames later. `flushSync`
      // makes the bodies this commit mounts have heights before the handler
      // returns, so the y it reads is the y it lands on. The rAF path never
      // flushes — this is the press path alone.
      // W4-C11: a stop the spread DECLARES but does not mount — the ladder
      // renders exactly that case as a non-pressable `<div role="text">`, and
      // the sections sheet has no mounted-check at all — is not in `ordered`,
      // so a loop that breaks on the match ran to the end and flushed EVERY
      // region on the paper inside a click handler. No target, no press.
      const stop = ordered.findIndex((root) => observed.get(root) === key);
      if (stop < 0) return;
      flushSync(() => {
        for (const root of ordered.slice(0, stop + 1)) promote(root);
      });
    };
    freezeRef.current = (next: boolean) => {
      if (frozen === next) return;
      frozen = next;
      // W4-C5: D-B19's "one `commitPending()` runs at the next settle" has no
      // next settle at rest — the timer is not running and only a scroll frame
      // would drain the buffer, so a reader who left a field without scrolling
      // held every buffered crossing quiet indefinitely. Thawing while already
      // settled therefore drains on the next frame; thawing mid-scroll leaves
      // it to the settle that is already armed (an unsettled document always
      // has its timer running — `runScrollFrame` arms it on the same frame it
      // unsettles).
      if (!next && settled) queueFrame();
    };
    settledRef.current = () =>
      settled
        ? Promise.resolve(true as const)
        : new Promise<true>((resolve, reject) => {
            waiting.push((reason) => (reason ? reject(reason) : resolve(true)));
          });

    window.__lensSettled = () => settledRef.current();

    return () => {
      stopped = true;
      if (settleTimer) clearTimeout(settleTimer);
      if (resolveDeadline) clearTimeout(resolveDeadline);
      if (resolveFrame !== null) window.cancelAnimationFrame(resolveFrame);
      document
        .querySelector(SHELL_SELECTOR)
        ?.removeAttribute(RESOLVED_ATTRIBUTE);
      intersection?.disconnect();
      mutation?.disconnect();
      window.removeEventListener('scroll', onScroll);
      releaseWaiting(
        new Error('the lens left the paper before it settled'),
      );
      if (window.__lensSettled) delete window.__lensSettled;
      forceRef.current = () => {};
      freezeRef.current = () => {};
      settledRef.current = () => Promise.resolve(true as const);
      clearStore();
    };
  }, [enabled, paperRef]);

  return useMemo<LensDensityApi>(
    () => ({
      forceFullThrough: (key) => forceRef.current(key),
      settled: () => settledRef.current(),
      subscribe: subscribeDensity,
      getDensity: densityFor,
      freeze: (frozen) => freezeRef.current(frozen),
    }),
    [],
  );
}
