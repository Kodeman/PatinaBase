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
 * `quiet` to `full`. No `startTransition` anywhere.
 *
 * `data-passed` is written once its root's bottom passes above the frame's top
 * and is NEVER removed — it is what `content-visibility: auto` keys on, and a
 * region that could lose it would be a region whose height could change above
 * the reader. Passing does not promote: a region above the frame growing from
 * its reserve to its full height is exactly the layout shift H5 forbids.
 *
 * Attachment is a `MutationObserver` on `[data-document-paper]`, not the
 * running index's retry window: regions arrive as their own queries settle, and
 * a subscription cannot miss one the way a lapsing retry can.
 *
 * The store is module-level rather than a context because the hook is called
 * once, at the page's root, while the bodies that listen are several levels
 * down inside components the page composes but does not wrap.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import type { RefObject } from 'react';
import {
  LENS_LOOKAHEAD_PX,
  LENS_SETTLE_MS,
  LENS_SETTLE_VELOCITY_PX,
} from '@/lib/document/lens-constants';
import type { DocumentIndexKey } from '@/lib/document/document-index';
import type { RegionDensity } from '@/components/document/region/use-region-fold';

const PAPER_SELECTOR = '[data-document-paper]';
const REGION_SELECTOR = '[data-index-region]';
const SHELL_SELECTOR = '[data-document-shell]';

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

function densityFor(region: string): RegionDensity | null {
  return promotedKeys.has(region) ? 'full' : null;
}

/** The lens has left the paper. Cleared without notifying: the only caller is
 *  the hook's own teardown, and every listener is a body coming down with it. */
function clearStore(): void {
  promotedKeys.clear();
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

  useEffect(() => {
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
    let mutationTarget: Node | null = null;

    let discoverQueued = false;
    let frameQueued = false;
    let scrollQueued = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = true;
    let lastY = window.scrollY;
    let waiting: Array<() => void> = [];
    let stopped = false;

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

    const releaseWaiting = (): void => {
      const held = waiting;
      waiting = [];
      for (const resolve of held) resolve();
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
      if (pending.size === 0) return;
      for (const root of ordered) if (pending.has(root)) promote(root);
      // A root that left the paper between crossing and settling is no longer
      // in `ordered`; it has nothing left to be written to.
      pending.clear();
    };

    const markPassed = (): void => {
      for (const root of ordered) {
        if (passed.has(root)) continue;
        if (root.getBoundingClientRect().bottom >= 0) continue;
        passed.add(root);
        root.setAttribute('data-passed', '');
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
      if (travelled >= LENS_SETTLE_VELOCITY_PX) {
        if (settleTimer) {
          clearTimeout(settleTimer);
          settleTimer = null;
        }
        if (settled) writeSettled(false);
      } else if (!settled && settleTimer === null) {
        settleTimer = setTimeout(settle, LENS_SETTLE_MS);
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
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const root = entry.target as HTMLElement;
        if (committed.has(root)) continue;
        pending.add(root);
      }
      queueFrame();
    };

    const discover = (): void => {
      discoverQueued = false;
      if (stopped) return;

      const paper = resolvePaper();
      if (mutation && paper && mutationTarget !== paper) {
        mutation.disconnect();
        mutation.observe(paper, { childList: true, subtree: true });
        mutationTarget = paper;
      }

      const found = paper
        ? Array.from(paper.querySelectorAll<HTMLElement>(REGION_SELECTOR))
        : [];
      ordered = found;

      for (const root of Array.from(observed.keys())) {
        if (root.isConnected) continue;
        observed.delete(root);
        committed.delete(root);
        passed.delete(root);
        pending.delete(root);
        intersection?.unobserve(root);
      }

      for (const root of found) {
        const key = root.getAttribute('data-index-region') ?? '';
        observed.set(root, key);
        if (committed.has(root)) continue;
        // A region React re-created under a key the lens has already promoted
        // arrives full; the reader passed it once and never takes it back.
        if (!enabled || promotedKeys.has(key)) {
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
      mutation = new MutationObserver(queueDiscover);
      mutationTarget = resolvePaper() ?? document.body;
      mutation.observe(mutationTarget, { childList: true, subtree: true });
    }

    if (enabled) {
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    writeSettled(true);
    discover();

    forceRef.current = (key: DocumentIndexKey) => {
      for (const root of ordered) {
        promote(root);
        if (observed.get(root) === key) break;
      }
    };
    settledRef.current = () =>
      settled
        ? Promise.resolve(true as const)
        : new Promise<true>((resolve) => {
            waiting.push(() => resolve(true));
          });

    window.__lensSettled = () => settledRef.current();

    return () => {
      stopped = true;
      if (settleTimer) clearTimeout(settleTimer);
      intersection?.disconnect();
      mutation?.disconnect();
      window.removeEventListener('scroll', onScroll);
      releaseWaiting();
      if (window.__lensSettled) delete window.__lensSettled;
      forceRef.current = () => {};
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
    }),
    [],
  );
}
