'use client';

/**
 * US-14 arrival — the persistent mount (CONTRACT §3, split mount). Never keyed: it installs the
 * arrival's window-capture listeners exactly once for the tab's life, forwards every event to the
 * run ArrivalRun sets, ends the ready wait on her hand (swallowing Escape), refreshes the visit on
 * her hand, writes the click token, and lands the Desk on the row a Document was put down from.
 */
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { notePopState } from '@/lib/arrival/nav';
import type { Run } from '@/lib/arrival/run-contract';
import {
  consumeFromDoc,
  parseLanding,
  readFromDoc,
  touchVisit,
  writeArriveToken,
} from '@/lib/arrival/session';
import { BUDGET } from '@/lib/arrival/types';
import type { ArriveToken } from '@/lib/arrival/types';

let installed = false;
let activeRun: Run | null = null;
let cancelWait: (() => void) | null = null;

/** ArrivalRun hands the started run here; the listeners forward to it. */
export function setActiveRun(run: Run | null): void {
  activeRun = run;
}

export function getActiveRun(): Run | null {
  return activeRun;
}

/** ArrivalRun hands its wait-cancel here from `arr-pre` until the run starts or the wait declines
 *  (then null). Meanwhile Escape is swallowed, and any key, press, wheel or swipe ends the wait for
 *  good: the resting page, no later start (arrival.js `halt()`). */
export function setArrivalWaiting(cancel: (() => void) | null): void {
  cancelWait = cancel;
}

function haltWait(): void {
  const cancel = cancelWait;
  cancelWait = null;
  cancel?.();
}

function mark(): void {
  touchVisit(Date.now());
}

function onKeyDown(e: KeyboardEvent): void {
  mark();
  if (activeRun) {
    activeRun.onKeyDown(e);
    return;
  }
  if (!cancelWait) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  haltWait();
}

/** Chrome stays visible and live under `arr-pre`, so a press during the wait is never swallowed. */
function onPointerDown(e: PointerEvent): void {
  mark();
  if (activeRun) activeRun.onPointerDown(e);
  else haltWait();
}

function onPointerUp(e: PointerEvent): void {
  activeRun?.onPointerUp(e);
}

function onWheel(e: WheelEvent): void {
  mark();
  if (activeRun) activeRun.onWheel(e);
  else haltWait();
}

function onTouchMove(e: TouchEvent): void {
  mark();
  if (activeRun) activeRun.onTouchMove(e);
  else haltWait();
}

function onScroll(e: Event): void {
  // Only the page's own scroll; an inner scroller's scroll reaches window capture too.
  if (e.target !== document && e.target !== document.documentElement) return;
  activeRun?.onScroll();
}

function onFocusIn(e: FocusEvent): void {
  activeRun?.onFocusIn(e);
}

function onVisibilityChange(): void {
  activeRun?.onVisibilityChange();
}

function onPopState(): void {
  notePopState(Date.now());
}

const TOKEN_LINKS =
  '[data-register="act"] a, [data-roster-name], [data-claim-card] a[href^="/doc/"]';

function onClick(e: MouseEvent): void {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const target = e.target;
  if (!(target instanceof Element)) return;
  const hit = target.closest(TOKEN_LINKS);
  const anchor = hit?.closest('a');
  if (!anchor || !anchor.href) return;
  if (anchor.target && anchor.target !== '_self') return;
  if (anchor.hasAttribute('download')) return;
  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) return;
  const token: ArriveToken = {
    via: anchor.closest('[data-register="act"]') ? 'act' : e.detail === 0 ? 'kbd' : 'ptr',
    to: url.pathname,
    at: Date.now(),
  };
  const landing = parseLanding(anchor.getAttribute('data-landing'));
  if (landing) token.landing = landing;
  writeArriveToken(token);
}

/**
 * Idempotent. Called from ArrivalMount's render so the listeners exist before any effect in the
 * layout's first commit — every chrome window-capture listener (CommandBar, LogStrip, MarginNote,
 * LogTimeSheet, DraftProposalOpener) registers in an effect, and later re-registrations land
 * behind these too, since these are never removed.
 */
export function installArrivalListeners(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const active = { capture: true, passive: false } as const;
  const passive = { capture: true, passive: true } as const;
  window.addEventListener('keydown', onKeyDown, active);
  window.addEventListener('pointerdown', onPointerDown, active);
  window.addEventListener('pointerup', onPointerUp, active);
  window.addEventListener('focusin', onFocusIn, active);
  window.addEventListener('click', onClick, active);
  // The mockup's wheel/touch handlers never preventDefault; a non-passive window touchmove
  // would cost every page's scroll.
  window.addEventListener('wheel', onWheel, passive);
  window.addEventListener('touchmove', onTouchMove, passive);
  window.addEventListener('scroll', onScroll, passive);
  window.addEventListener('visibilitychange', onVisibilityChange, { capture: true });
  window.addEventListener('popstate', onPopState, { capture: true });
}

const DESK_READY = '[data-arrival="desk"][data-arrival-ready]';

export function ArrivalMount(): null {
  installArrivalListeners();
  const pathname = usePathname();

  // The put-down's row: once the Desk is ready, one frame after Next's own post-navigation scroll.
  useEffect(() => {
    if (pathname !== '/desk' || readFromDoc() === null) return;
    let frame = 0;
    let timer = 0;
    let observer: MutationObserver | null = null;
    let landed = false;
    const land = () => {
      if (landed || !document.querySelector(DESK_READY)) return;
      landed = true;
      observer?.disconnect();
      window.clearTimeout(timer);
      frame = window.requestAnimationFrame(() => {
        const id = consumeFromDoc();
        if (id) document.getElementById(`roster-line-${id}`)?.scrollIntoView({ block: 'center' });
      });
    };
    land();
    if (!landed) {
      observer = new MutationObserver(land);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-arrival', 'data-arrival-ready'],
      });
      timer = window.setTimeout(() => observer?.disconnect(), BUDGET.HARD_ENTRY_READY_MS);
    }
    return () => {
      observer?.disconnect();
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return null;
}
