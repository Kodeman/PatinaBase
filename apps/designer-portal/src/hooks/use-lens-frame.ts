'use client';

/**
 * The frame's two yields (W3, L-3 / L-6).
 *
 * Two questions, two geometries, two observers:
 *
 *   · is the LETTERHEAD still in frame — the band's `open` form at s0, where
 *     line 1 yields everything the letterhead 60px above already prints, and
 *     the rail head's L-6 yield of its stage phrase (RF-02);
 *   · which stop's own region head is crossing the frame's TOP BAND — the
 *     ladder's L-3 yield, where that segment's value gives way to its name.
 *
 * The second is bottom-margined to the top 15% of the frame, so a head deep in
 * the viewport is not "in frame" for this purpose. That is a different geometry
 * from the reading band (`use-document-running-index`, `-20% / -62%`) and from
 * the Wave-4 lookahead, which is why it is its own observer rather than a third
 * answer squeezed out of an existing one.
 */

import { useEffect, useState } from 'react';
import type { DocumentIndexKey } from '@/lib/document/document-index';

const LETTERHEAD_ID = 'document-project-status';
const PAPER = '[data-document-paper]';
/** The frame's top 15%: a head is "in frame" only while it is crossing it. */
const HEAD_BAND = '0px 0px -85% 0px';

export interface LensFrame {
  /** `#document-project-status` intersects the viewport. True before the first
   *  observation, because s0 is where every document opens. */
  letterheadInFrame: boolean;
  /** The stop whose region head is in the top band, or null. */
  headInFrame: DocumentIndexKey | null;
}

export function useLensFrame(): LensFrame {
  const [letterheadInFrame, setLetterheadInFrame] = useState(true);
  const [headInFrame, setHeadInFrame] = useState<DocumentIndexKey | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setLetterheadInFrame(entry.isIntersecting);
      },
      { threshold: 0 },
    );

    let watched: Element | null = null;
    let mutations: MutationObserver | null = null;
    const attach = () => {
      const el = document.getElementById(LETTERHEAD_ID);
      if (!el || el === watched) return;
      if (watched) observer.unobserve(watched);
      watched = el;
      observer.observe(el);
      // The letterhead is mounted once per document and never replaced, so the
      // watch for its arrival retires the moment it arrives rather than waking
      // on every mutation in the application for the life of the page.
      mutations?.disconnect();
      mutations = null;
    };

    attach();
    if (!watched && typeof MutationObserver !== 'undefined') {
      mutations = new MutationObserver(attach);
      mutations.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer.disconnect();
      mutations?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    // One head per stop: the FIRST `[data-region-head]` inside each region
    // root. A region's inner heads (`schedule-rule`, `working-boards`) carry
    // the same attribute but are not the stop's own head, and their values are
    // not the ones that yield.
    const keyOf = new Map<Element, DocumentIndexKey>();
    const order: Element[] = [];
    const crossing = new Map<DocumentIndexKey, boolean>();

    const resolve = () => {
      // Last in paper order wins: scrolling down, the head that has just
      // reached the band is the one below the one leaving it.
      let inFrame: DocumentIndexKey | null = null;
      for (const el of order) {
        const key = keyOf.get(el);
        if (key && crossing.get(key)) inFrame = key;
      }
      setHeadInFrame((previous) => (previous === inFrame ? previous : inFrame));
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = keyOf.get(entry.target);
          if (key) crossing.set(key, entry.isIntersecting);
        }
        resolve();
      },
      { rootMargin: HEAD_BAND, threshold: 0 },
    );

    const attach = () => {
      const paper = document.querySelector(PAPER);
      const found = new Map<Element, DocumentIndexKey>();
      for (const root of paper
        ? Array.from(paper.querySelectorAll('[data-index-region]'))
        : []) {
        const key = root.getAttribute(
          'data-index-region',
        ) as DocumentIndexKey | null;
        const head = root.querySelector('[data-region-head]');
        if (!key || !head || found.has(head)) continue;
        found.set(head, key);
      }

      for (const [el, key] of keyOf) {
        if (found.has(el)) continue;
        observer.unobserve(el);
        // A root that has left carries a stale answer; keeping it would hold
        // the yield on a segment whose head is no longer on the paper.
        crossing.delete(key);
      }
      keyOf.clear();
      order.length = 0;
      for (const [el, key] of found) {
        observer.observe(el);
        keyOf.set(el, key);
        order.push(el);
      }
      resolve();
    };

    attach();

    // Regions mount as their reads answer, and Wave 4's quiet bodies will
    // replace their own subtrees; one rAF of debounce keeps a spread that
    // mounts six roots in one commit to one re-attach.
    let queued = false;
    const mutations =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            if (queued) return;
            queued = true;
            window.requestAnimationFrame(() => {
              queued = false;
              attach();
            });
          });
    mutations?.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations?.disconnect();
    };
  }, []);

  return { letterheadInFrame, headInFrame };
}
