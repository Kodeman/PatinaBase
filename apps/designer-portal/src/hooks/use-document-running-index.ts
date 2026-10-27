'use client';

/**
 * The running index's reading line — which region the paper is currently open
 * at, and the jump that takes you to another one.
 *
 * One IntersectionObserver over the region ROOTS (`data-index-region`), at the
 * prototype's reading band (`-20% 0px -62% 0px`). Roots are used rather than
 * headings because a folded region unmounts its body: heading and fold seam
 * swap, the root does not move.
 *
 * Attachment is a SUBSCRIPTION: a MutationObserver on the paper root
 * (`[data-document-paper]`) re-attaches whenever region roots are added or
 * removed. Regions arrive as their own queries settle, several paints after
 * this hook first runs, and the foot of the paper (care, the record) can mount
 * far later still — the retry window this replaces gave up after ~2s and left
 * those roots unobserved forever, which reads as a rail that goes quiet at the
 * foot rather than as an error.
 *
 * A jump LOCKS the line onto its target for the length of the smooth scroll
 * (L-10), so the line commits to where you asked to go instead of walking every
 * region the scroll passes through: while the lock holds, the target IS the
 * reading stop and every intermediate root reporting itself is ignored.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  regionAnchorSelector,
  regionHeadingId,
  requestRegionUnfold,
  UNFOLD_REGION_EVENT,
  type DocumentIndexKey,
} from '@/lib/document/document-index';
import type { Round8ChapterKey } from '@/lib/document/round8-paper-order';

/** Legacy region stops, or the round-8 paper's chapters (R8-02). */
type IndexKey = DocumentIndexKey | Round8ChapterKey;

const READING_BAND = '-20% 0px -62% 0px';
const JUMP_LOCK_MS = 700;
const PAPER_ROOT_SELECTOR = '[data-document-paper]';

/**
 * Every root lookup is scoped to the PAPER. W2 gave the rail's ladder a
 * `data-index-region` button per stop (C-4), and the rail is the grid's first
 * column — so an unscoped `document.querySelector` returns the rail's own row
 * instead of the region it names, and the index would observe itself.
 */
function regionRoot(key: IndexKey): Element | null {
  const paper = document.querySelector(PAPER_ROOT_SELECTOR);
  return (paper ?? document).querySelector(regionAnchorSelector(key as DocumentIndexKey));
}

export interface DocumentRunningIndex<K extends IndexKey = DocumentIndexKey> {
  activeKey: K | null;
  /**
   * The keys whose `[data-index-region]` root is on the paper right now, in
   * paper order. A stop with no root is nowhere to jump to — no scroll, no
   * heading to land focus on — so the rail prints it rather than offering it
   * as a press (C-04).
   */
  mountedKeys: readonly K[];
}

export function useDocumentRunningIndex<K extends IndexKey = DocumentIndexKey>(
  keys: readonly K[],
  projectId: string,
): DocumentRunningIndex<K> {
  const [activeKey, setActiveKey] = useState<K | null>(null);
  const [mountedKeys, setMountedKeys] = useState<readonly K[]>([]);
  const lockRef = useRef<K | null>(null);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyList = keys.join('|');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const ordered = keyList ? (keyList.split('|') as K[]) : [];
    if (ordered.length === 0) return;

    const seen = new Map<K, boolean>();
    // Every branch below reads THIS set, not `ordered`: a spread states the
    // regions it means to mount, but only the ones the DOM actually answers for
    // may hold the reading line. Otherwise a key whose root never appeared
    // (unmounted for this spread, or still settling) wins the first-region and
    // foot-of-the-paper fallbacks and the index marks a row with nothing
    // behind it.
    const attached = new Set<K>();

    const resolve = () => {
      if (lockRef.current && attached.has(lockRef.current)) {
        setActiveKey(lockRef.current);
        return;
      }
      const present = ordered.filter((key) => attached.has(key));
      if (present.length === 0) {
        setActiveKey(null);
        return;
      }
      // The foot of the paper belongs to the last region: the final region can
      // never reach the reading band, so without this a jump to it settles
      // back onto the one above.
      const atFoot =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4;
      if (atFoot) {
        setActiveKey(present[present.length - 1]);
        return;
      }
      const crossing = present.find((key) => seen.get(key));
      if (crossing) {
        setActiveKey(crossing);
        return;
      }
      const anchor = window.innerHeight * 0.25;
      let best = present[0];
      for (const key of present) {
        const el = regionRoot(key);
        if (el && el.getBoundingClientRect().top <= anchor) best = key;
      }
      setActiveKey(best);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = entry.target.getAttribute(
            'data-index-region',
          ) as K | null;
          if (key) seen.set(key, entry.isIntersecting);
        }
        resolve();
      },
      { rootMargin: READING_BAND, threshold: 0 },
    );

    // `observe` is idempotent per element, so re-running this over roots that
    // are already observed costs nothing and simply picks up the new ones. A
    // root that has LEFT the DOM is unobserved and drops out of `attached`, or
    // the line would go on marking a region the spread has since unmounted.
    const observing = new Map<K, Element>();

    // One rAF of debounce: a spread mounting several regions in one commit
    // produces one batch of records, and re-attaching per record would query
    // the whole list once per root.
    let attachQueued = false;
    const queueAttach = () => {
      if (attachQueued) return;
      attachQueued = true;
      window.requestAnimationFrame(() => {
        attachQueued = false;
        attach();
      });
    };

    const mutations =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(queueAttach);

    // The paper is the subtree the roots live in. Before it exists (the first
    // paint of a still-loading document) the body is watched INSTEAD, so the
    // paper's own arrival is the mutation that attaches the roots inside it —
    // and the watch then moves onto the paper. A body watch that outlives the
    // paper's arrival wakes on every childList mutation in the application (a
    // sheet, a toast, a portal, any re-render) and pays a forced layout per
    // frame for churn that cannot contain a region root.
    let mutationTarget: Node | null = null;
    const watchForRoots = () => {
      const target = document.querySelector(PAPER_ROOT_SELECTOR) ?? document.body;
      if (target === mutationTarget) return;
      mutations?.disconnect();
      mutationTarget = target;
      mutations?.observe(target, { childList: true, subtree: true });
    };

    const attach = () => {
      for (const key of ordered) {
        const el = regionRoot(key);
        const previous = observing.get(key);
        if (previous && previous !== el) {
          observer.unobserve(previous);
          // `seen` is the last intersection each key REPORTED. A root that
          // has left carries a stale answer, and `resolve()`'s crossing
          // branch would hand the line to a region far off-screen the moment
          // a replacement root is observed but has not yet been delivered.
          seen.delete(key);
        }
        if (!el) {
          observing.delete(key);
          attached.delete(key);
          seen.delete(key);
          continue;
        }
        observer.observe(el);
        observing.set(key, el);
        attached.add(key);
      }
      watchForRoots();
      // Published by identity, not by value: `attached` is rebuilt on every
      // mutation batch and a fresh array each time would re-render the whole
      // document for a subtree that changed nothing about the roots.
      const present = ordered.filter((key) => attached.has(key));
      setMountedKeys((previous) =>
        previous.length === present.length &&
        previous.every((key, i) => key === present[i])
          ? previous
          : present,
      );
      resolve();
    };

    watchForRoots();
    attach();

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        resolve();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      mutations?.disconnect();
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [keyList]);

  useEffect(
    () => () => {
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    },
    [],
  );

  // Anyone may ask a region to unfold — the index's own rows, and the job
  // ticket's Pieces/Money/Dates rows, which are not inside this hook. Whoever
  // asks, the reading line commits to the target for the length of the scroll
  // instead of walking every region the smooth scroll passes; there is one
  // lock, and it lives with the line it locks.
  useEffect(() => {
    const onUnfold = (event: Event) => {
      const key = (event as CustomEvent<{ region?: K }>).detail?.region;
      if (!key) return;
      setActiveKey(key);
      lockRef.current = key;
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      lockTimerRef.current = setTimeout(() => {
        lockRef.current = null;
      }, JUMP_LOCK_MS);
    };
    window.addEventListener(UNFOLD_REGION_EVENT, onUnfold);
    return () => window.removeEventListener(UNFOLD_REGION_EVENT, onUnfold);
  }, []);

  // W4-C20 — `jump` is DELETED, not kept unused. D-B18 moved the press to one
  // handler in `page.tsx` (`requestRegionUnfold → lens.forceFullThrough →
  // scrollToRegion`); this hook's version had no `forceFullThrough` and would
  // land the reader on a still-quiet root, which is exactly the bug D-B18
  // exists to answer. A dead footgun one autocomplete from re-introducing it
  // is not a smaller risk than a live one.
  return { activeKey, mountedKeys };
}

/**
 * Land on a region: scroll its root into view and put focus on its heading
 * (a round-8 chapter names its own heading — `round8ChapterHeadingId`),
 * after the paint that mounted a just-unfolded body. Exported because the job
 * ticket performs the same act from outside this hook — one copy, so the two
 * cannot drift.
 */
export function scrollToRegion(key: DocumentIndexKey, projectId: string): void;
export function scrollToRegion(
  key: Round8ChapterKey,
  projectId: string,
  headingId: string,
): void;
export function scrollToRegion(
  key: IndexKey,
  projectId: string,
  headingId?: string,
): void {
  const headingTarget =
    headingId ?? regionHeadingId(key as DocumentIndexKey, projectId);
  const behavior: ScrollBehavior = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches
    ? 'auto'
    : 'smooth';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const root = regionRoot(key);
      root?.scrollIntoView({ block: 'start', behavior });
      const heading = document.getElementById(headingTarget);
      (heading ?? (root as HTMLElement | null))?.focus?.({
        preventScroll: true,
      });
      if (root) holdLanding(root, behavior);
    });
  });
}

const READER_SCROLL = ['wheel', 'touchstart', 'pointerdown', 'keydown'];

/**
 * Bodies above the target that finish loading after the press push it down
 * mid-scroll, leaving focus on a heading below the fold. Follow the root
 * until the reader acts for themselves, or for two seconds. The reader's input
 * is heard in the CAPTURE phase: controls that consume their keys (a month
 * grid's arrows, an instrument's Escape) stop propagation, and a bubble-phase
 * listener would leave the follower pulling the page back under them.
 */
function holdLanding(root: Element, behavior: ScrollBehavior) {
  if (typeof ResizeObserver === 'undefined') return;
  const at = () => root.getBoundingClientRect().top + window.scrollY;
  let landing = at();
  const follow = new ResizeObserver(() => {
    const now = at();
    if (Math.abs(now - landing) < 1) return;
    landing = now;
    root.scrollIntoView({ block: 'start', behavior });
  });
  const release = () => {
    follow.disconnect();
    for (const type of READER_SCROLL) {
      window.removeEventListener(type, release, { capture: true });
    }
  };
  follow.observe(document.documentElement);
  for (const type of READER_SCROLL) {
    window.addEventListener(type, release, { capture: true, passive: true });
  }
  window.setTimeout(release, 2000);
}
