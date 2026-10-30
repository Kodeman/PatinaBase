'use client';

/**
 * RC7-E8-4 — the round-8 paper reveals its body chapter by chapter, top down.
 *
 * Every chapter mounts at once and resolves on its own read, so a chapter in
 * the first screen used to be pushed down once per body above it (cold-load
 * CLS 1.16). round8.css holds every child of the paper below the cover at
 * opacity 0 until it carries `data-paper-shown` (or the lens has resolved the
 * whole paper, or its own 3,500ms failsafe fires). This hook writes that mark,
 * in paper order, using the lens's own settle signals (D-B46) per chapter:
 *
 * - nothing above the chapter still prints a loading register
 *   (`LOADING_SELECTOR`) or is a region the lens still holds quiet, and
 * - the chapter's top, which is the height of everything above it, has held
 *   for `LENS_RESOLVE_STABLE_FRAMES` frames.
 *
 * The lens's third signal, "no paper read fetching", is a count over the whole
 * page and cannot be pinned to a chapter, so it is spent where it already is:
 * the lens's resolution (`data-lens-resolved`) releases every chapter at once,
 * and the sampler stops.
 *
 * A landing never meets an invisible chapter: a jump (the unfold request every
 * chapter, region and FF&E-line jump dispatches), a page landing that scrolls
 * itself (`scrollIntoRevealed`, `revealPaperThrough`), any focus arriving
 * inside a held chapter, and any scroll away from where the paper opened
 * (find-in-page, a screen reader's cursor) reveal the chapter it reaches and
 * everything above it at once.
 *
 * The sampler stops once every chapter shows, at lens resolution, or at the
 * CSS failsafe (`REVEAL_FAILSAFE_MS`), whichever comes first.
 *
 * Accepted residual: find-in-page or a screen reader's virtual cursor can reach
 * held text already in the viewport without a scroll or focus; it shows at lens
 * resolution (typically ≤ 2.5s) or the 3.5s per-chapter failsafe at the latest.
 */

import { useLayoutEffect, type RefObject } from 'react';
import { LOADING_SELECTOR } from '@/hooks/use-lens-density';
import { LENS_RESOLVE_STABLE_FRAMES } from '@/lib/document/lens-constants';
import { UNFOLD_REGION_EVENT } from '@/lib/document/document-index';
import { ROUND8_PAPER_ORDER } from '@/lib/document/round8-paper-order';
import {
  heldChildren,
  REVEAL_FAILSAFE_MS,
  revealThrough,
  SHOWN_ATTRIBUTE,
} from '@/lib/document/paper-reveal';

export { REVEAL_FAILSAFE_MS };
/** What can still move the paper below it: a body printing its loading
 *  register, or a region the lens still holds `quiet` — at resolution a region
 *  whose own data reads `full` takes its height at once (D-B46). */
const UNSETTLED_SELECTOR = `${LOADING_SELECTOR}, [data-density="quiet"]`;

/** The element `location.hash` names, if any. */
function hashTarget(): Element | null {
  const id = window.location.hash.slice(1);
  if (!id) return null;
  try {
    return document.getElementById(decodeURIComponent(id));
  } catch {
    return document.getElementById(id);
  }
}

/** Reveal through the lowest held child that meets the viewport. */
function revealInView(paper: Element): void {
  const inView = heldChildren(paper).filter((child) => {
    const rect = child.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
  });
  revealThrough(paper, inView[inView.length - 1] ?? null);
}

/** The element a jump to `key` lands in: its region root, or the chapter that
 *  carries that legacy region. */
function jumpTarget(paper: Element, key: string): Element | null {
  const chapter = ROUND8_PAPER_ORDER.find((c) => c.key === key || c.region === key)?.key;
  return (
    paper.querySelector(`[data-index-region="${key}"]`) ??
    (chapter ? paper.querySelector(`[data-paper-chapter="${chapter}"]`) : null)
  );
}

export interface RevealState {
  /** Last measured top, and how many frames it has held, per child. */
  tops: WeakMap<Element, { top: number; frames: number }>;
}

/**
 * One frame of the sampler. Every child's top is measured each frame, so the
 * frames a top has held accrue in parallel; a child is revealed only once all
 * above it are, nothing above it prints a register, and its own top has held.
 * True once every child shows. Exported for the unit suite.
 */
export function revealStep(paper: Element, state: RevealState): boolean {
  const origin = paper.getBoundingClientRect().top;
  const cover = paper.querySelector(':scope > [data-paper-cover]');
  let open = cover?.querySelector(UNSETTLED_SELECTOR) == null;
  for (const child of heldChildren(paper)) {
    const top = child.getBoundingClientRect().top - origin;
    const last = state.tops.get(child);
    const frames = last && last.top === top ? last.frames + 1 : 0;
    state.tops.set(child, { top, frames });
    if (!child.hasAttribute(SHOWN_ATTRIBUTE)) {
      if (open && frames >= LENS_RESOLVE_STABLE_FRAMES) child.setAttribute(SHOWN_ATTRIBUTE, '');
      else open = false;
    }
    if (child.matches(UNSETTLED_SELECTOR) || child.querySelector(UNSETTLED_SELECTOR)) open = false;
  }
  return heldChildren(paper).every((child) => child.hasAttribute(SHOWN_ATTRIBUTE));
}

export function useChapterReveal(gridRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const paper = grid?.querySelector('[data-document-paper]');
    const shell = grid?.closest('[data-document-shell]');
    if (!paper || !shell) return;
    const state: RevealState = { tops: new WeakMap() };
    // A hash or a restored position that landed before this effect ran: show
    // the chapter it names or sits in now, not when the sampler reaches it.
    revealThrough(paper, hashTarget());
    if (window.scrollY > 0) revealInView(paper);
    const started = performance.now();
    let frame = 0;
    const tick = () => {
      if (shell.hasAttribute('data-lens-resolved')) return;
      if (performance.now() - started >= REVEAL_FAILSAFE_MS) return;
      if (revealStep(paper, state)) return;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // A scroll that left where the paper opened was the reader's or the
    // browser's (find-in-page, a screen reader's cursor): show what it reached.
    // Unscrolled, the first screen stays with the sampler.
    const openedAt = window.scrollY;
    const onScroll = () => {
      if (window.scrollY === openedAt || shell.hasAttribute('data-lens-resolved')) return;
      revealInView(paper);
    };
    const onJump = (event: Event) => {
      const key = (event as CustomEvent<{ region?: string }>).detail?.region;
      if (key) revealThrough(paper, jumpTarget(paper, key));
    };
    const onFocus = (event: FocusEvent) => revealThrough(paper, event.target as Element);
    window.addEventListener(UNFOLD_REGION_EVENT, onJump);
    window.addEventListener('scroll', onScroll, { passive: true });
    paper.addEventListener('focusin', onFocus as EventListener);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener(UNFOLD_REGION_EVENT, onJump);
      window.removeEventListener('scroll', onScroll);
      paper.removeEventListener('focusin', onFocus as EventListener);
    };
  }, [gridRef]);
}
