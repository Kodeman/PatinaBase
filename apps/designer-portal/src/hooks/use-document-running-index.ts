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
 * Attachment is a QUERY, not a subscription — there is no event when a region
 * mounts. Regions arrive as their own queries settle, several paints after this
 * hook first runs, so a single attach would silently observe two of four roots
 * forever. The effect therefore re-queries on a short retry until every root it
 * expects is found (or the window lapses), and re-runs whenever the key list
 * changes. A region that mounts after that window is genuinely not picked up;
 * that is the known limit, not an oversight.
 *
 * A jump LOCKS the line onto its target for the length of the smooth scroll,
 * so the line commits to where you asked to go instead of walking every region
 * the scroll passes through.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  regionAnchorSelector,
  regionHeadingId,
  requestRegionUnfold,
  type DocumentIndexKey,
} from '@/lib/document/document-index';

const READING_BAND = '-20% 0px -62% 0px';
const JUMP_LOCK_MS = 700;
/** Re-query for roots that have not mounted yet: ~2s at 8 tries. */
const ATTACH_RETRY_MS = 250;
const ATTACH_RETRIES = 8;

export interface DocumentRunningIndex {
  activeKey: DocumentIndexKey | null;
  jump: (key: DocumentIndexKey) => void;
}

export function useDocumentRunningIndex(
  keys: readonly DocumentIndexKey[],
  projectId: string,
): DocumentRunningIndex {
  const [activeKey, setActiveKey] = useState<DocumentIndexKey | null>(null);
  const lockRef = useRef<DocumentIndexKey | null>(null);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyList = keys.join('|');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const ordered = keyList ? (keyList.split('|') as DocumentIndexKey[]) : [];
    if (ordered.length === 0) return;

    const seen = new Map<DocumentIndexKey, boolean>();
    // Every branch below reads THIS set, not `ordered`: a spread states the
    // regions it means to mount, but only the ones the DOM actually answers for
    // may hold the reading line. Otherwise a key whose root never appeared
    // (unmounted for this spread, or still settling) wins the first-region and
    // foot-of-the-paper fallbacks and the index marks a row with nothing
    // behind it.
    const attached = new Set<DocumentIndexKey>();

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
        const el = document.querySelector(regionAnchorSelector(key));
        if (el && el.getBoundingClientRect().top <= anchor) best = key;
      }
      setActiveKey(best);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = entry.target.getAttribute(
            'data-index-region',
          ) as DocumentIndexKey | null;
          if (key) seen.set(key, entry.isIntersecting);
        }
        resolve();
      },
      { rootMargin: READING_BAND, threshold: 0 },
    );

    // `observe` is idempotent per element, so a retry that re-finds an
    // already-observed root costs nothing and simply picks up the new ones.
    let retriesLeft = ATTACH_RETRIES;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const attach = () => {
      retryTimer = null;
      for (const key of ordered) {
        const el = document.querySelector(regionAnchorSelector(key));
        if (!el) continue;
        observer.observe(el);
        attached.add(key);
      }
      resolve();
      if (attached.size < ordered.length && retriesLeft > 0) {
        retriesLeft -= 1;
        retryTimer = setTimeout(attach, ATTACH_RETRY_MS);
      }
    };
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
      if (retryTimer) clearTimeout(retryTimer);
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

  const jump = useCallback(
    (key: DocumentIndexKey) => {
      // A folded region has no body to land in — ask it to open first, then
      // scroll once the paint that mounted it has happened.
      requestRegionUnfold(key);
      setActiveKey(key);
      lockRef.current = key;
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      lockTimerRef.current = setTimeout(() => {
        lockRef.current = null;
      }, JUMP_LOCK_MS);

      const reduceMotion = window.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const root = document.querySelector(regionAnchorSelector(key));
          root?.scrollIntoView({
            block: 'start',
            behavior: reduceMotion ? 'auto' : 'smooth',
          });
          const heading = document.getElementById(
            regionHeadingId(key, projectId),
          );
          (heading ?? (root as HTMLElement | null))?.focus?.({
            preventScroll: true,
          });
        });
      });
    },
    [projectId],
  );

  return { activeKey, jump };
}
