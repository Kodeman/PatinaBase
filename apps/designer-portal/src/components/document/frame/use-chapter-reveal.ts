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
 * chapter, region and FF&E-line jump dispatches) and any focus arriving inside
 * a held chapter reveal it and everything above it at once.
 */

import { useLayoutEffect, type RefObject } from 'react';
import { LOADING_SELECTOR } from '@/hooks/use-lens-density';
import { LENS_RESOLVE_STABLE_FRAMES } from '@/lib/document/lens-constants';
import { UNFOLD_REGION_EVENT } from '@/lib/document/document-index';
import { ROUND8_PAPER_ORDER } from '@/lib/document/round8-paper-order';

export const SHOWN_ATTRIBUTE = 'data-paper-shown';
/** What can still move the paper below it: a body printing its loading
 *  register, or a region the lens still holds `quiet` — at resolution a region
 *  whose own data reads `full` takes its height at once (D-B46). */
const UNSETTLED_SELECTOR = `${LOADING_SELECTOR}, [data-density="quiet"]`;

/** The paper's held children, in paper order: everything below the cover. */
function heldChildren(paper: Element): HTMLElement[] {
  return Array.from(paper.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && !child.hasAttribute('data-paper-cover'),
  );
}

/** Mark every child up to and including the one holding `target`. */
export function revealThrough(paper: Element, target: Element | null): void {
  if (!target) return;
  const children = heldChildren(paper);
  const index = children.findIndex((child) => child.contains(target));
  for (let i = 0; i <= index; i++) children[i]!.setAttribute(SHOWN_ATTRIBUTE, '');
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
 * Exported for the unit suite.
 */
export function revealStep(paper: Element, state: RevealState): void {
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
}

export function useChapterReveal(gridRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const paper = grid?.querySelector('[data-document-paper]');
    const shell = grid?.closest('[data-document-shell]');
    if (!paper || !shell) return;
    const state: RevealState = { tops: new WeakMap() };
    let frame = 0;
    const tick = () => {
      if (shell.hasAttribute('data-lens-resolved')) return;
      revealStep(paper, state);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onJump = (event: Event) => {
      const key = (event as CustomEvent<{ region?: string }>).detail?.region;
      if (key) revealThrough(paper, jumpTarget(paper, key));
    };
    const onFocus = (event: FocusEvent) => revealThrough(paper, event.target as Element);
    window.addEventListener(UNFOLD_REGION_EVENT, onJump);
    paper.addEventListener('focusin', onFocus as EventListener);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener(UNFOLD_REGION_EVENT, onJump);
      paper.removeEventListener('focusin', onFocus as EventListener);
    };
  }, [gridRef]);
}
