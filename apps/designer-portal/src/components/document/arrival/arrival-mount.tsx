'use client';

/**
 * US-14 arrival — the persistent mount (CONTRACT §3, split mount). Never keyed: it installs the
 * arrival's window-capture listeners exactly once for the tab's life, forwards every event to the
 * run ArrivalRun sets, ends the ready wait on her hand (swallowing Escape, and the click of a press
 * on the hidden route root), refreshes the visit on her hand, writes the click token, advances the
 * nav state on the bare routes ArrivalRoute never renders on, and lands the Desk on the row a
 * Document was put down from when the Desk's own arrival declined.
 */
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { isBareDocumentRoute } from '@/components/document/document-route-boundary';
import { isEditableTarget } from '@/hooks/use-lens-state';
import { SCROLL } from '@/lib/arrival/engine';
import { enterRoute, notePopState } from '@/lib/arrival/nav';
import type { Run } from '@/lib/arrival/run-contract';
import {
  consumeFromDoc,
  parseLanding,
  touchVisit,
  writeArriveToken,
} from '@/lib/arrival/session';
import { BUDGET, EVENT_ENDED } from '@/lib/arrival/types';
import type { ArrivalEnded, ArriveToken } from '@/lib/arrival/types';

/** A tap's click is its own input task after the pointerup; a mouse's follows in the same task. */
const TAP_CLICK_MS = 400;

/** What ended the wait: her hand, by kind, or the page's own lifecycle. */
export type WaitHalt =
  | 'escape'
  | 'key'
  | 'pointer'
  | 'wheel'
  | 'touchmove'
  | 'pagehide'
  | 'pageshow'
  | 'beforeprint'
  | 'reduced-motion';

let installed = false;
let activeRun: Run | null = null;
let cancelWait: ((halt: WaitHalt) => void) | null = null;
let swallowClick = false;
let swallowTimer = 0;
/** The run swallowed this press at its pointerdown. */
let pressHeld = false;
/** The run that swallowed it: its release is still that run's, even once the run has ended. */
let pressRun: Run | null = null;
/** This entry's run started and did not end inside start(): it played. */
let runStarted = false;
/** Her own scroll (a wheel or a swipe) ended this entry's wait. */
let waitScrolled = false;
/** The touch or pen press that ended this entry's wait, still down. A tap or the start of her
 *  swipe: only its touchmove, its pointercancel (the browser took it for a pan) or its pointerup
 *  tells, and each of those comes after the pointerdown that ended the wait. */
let waitGesture: number | null = null;
/** Landings waiting on that press to tell. */
const gestureWaiters = new Set<() => void>();
/** Drops the put-down row's landing: set from its unplayed decision until it has run. */
let cancelLanding: (() => void) | null = null;

/** ArrivalRun hands the started run here; the listeners forward to it. */
export function setActiveRun(run: Run | null): void {
  activeRun = run;
}

export function getActiveRun(): Run | null {
  return activeRun;
}

/** The pathname whose wait is armed, for its page (useArrivalWaiting); null when none is. */
let waitingPath: string | null = null;
const waitingListeners = new Set<() => void>();

/** ArrivalRun hands its wait-cancel here from `arr-pre` until the run starts or the wait declines
 *  (then null). Meanwhile any key, press, wheel or swipe ends the wait for good: the resting page,
 *  no later start (arrival.js `halt()`). Escape is swallowed and ends it as `escape`. */
export function setArrivalWaiting(
  cancel: ((halt: WaitHalt) => void) | null,
  pathname: string | null = null,
): void {
  cancelWait = cancel;
  const next = cancel ? pathname : null;
  if (next === waitingPath) return;
  waitingPath = next;
  for (const notify of [...waitingListeners]) notify();
}

function subscribeWaiting(notify: () => void): () => void {
  waitingListeners.add(notify);
  return () => {
    waitingListeners.delete(notify);
  };
}

/** True while this path's arrival wait is armed: its page keeps its own loading state until its
 *  ready mark, so the route root first appears ready. The server never waits. */
export function useArrivalWaiting(pathname: string): boolean {
  return useSyncExternalStore(
    subscribeWaiting,
    () => waitingPath === pathname,
    () => false,
  );
}

/** ArrivalRun, at each new entry: nothing has played and nothing has ended its wait yet. */
export function beginEntry(): void {
  runStarted = false;
  waitScrolled = false;
  waitGesture = null;
  gestureWaiters.clear();
}

/** ArrivalRun, once start() returned with the run not done. */
export function noteRunStarted(): void {
  runStarted = true;
}

function haltWait(halt: WaitHalt): void {
  const cancel = cancelWait;
  cancelWait = null;
  if (!cancel) return;
  // Before the cancel: it reports, and the landings read this on that same EVENT_ENDED.
  if (halt === 'wheel' || halt === 'touchmove') waitScrolled = true;
  cancel(halt);
}

function closeGesture(scrolled: boolean): void {
  if (waitGesture === null) return;
  waitGesture = null;
  if (scrolled) waitScrolled = true;
  const waiting = [...gestureWaiters];
  gestureWaiters.clear();
  for (const decide of waiting) {
    try {
      decide();
    } catch {
      // A landing that throws costs neither the other landings nor the release that closed it.
    }
  }
}

/** A key that scrolls the page: the run's own list, outside a text field. */
function scrollKey(e: KeyboardEvent): boolean {
  return SCROLL.test(e.key) && !isEditableTarget(e.target);
}

/** Her own scroll before a decided landing has run: the page stays where she put it. */
function herScroll(): void {
  const cancel = cancelLanding;
  cancelLanding = null;
  cancel?.();
}

function arrivalHolds(html: HTMLElement): boolean {
  return html.classList.contains('arr-pre') || html.classList.contains('arr-on');
}

/**
 * A played arrival owns the viewport, and so does her own scroll: `onEnd(true)` only for an entry
 * that did not play — it ended declined, or no run ever started (an Escape-halted wait) — and whose
 * wait no wheel or swipe of hers ended. Called at once when no arrival holds the page (neither
 * `arr-pre` nor `arr-on`), else on the entry's EVENT_ENDED. Every end drops both classes before it
 * dispatches, so an event that arrives while one is still set is an earlier route's end, not this
 * entry's. When a touch or pen press ended the wait and is still down, the call waits for that
 * press to lift (a tap) or move (her swipe). Returns the unsubscribe.
 */
export function afterArrival(onEnd: (unplayed: boolean) => void): () => void {
  const html = document.documentElement;
  let pending: (() => void) | null = null;
  const settle = (declined: boolean) => {
    const decide = () => {
      pending = null;
      onEnd((declined || !runStarted) && !waitScrolled);
    };
    if (waitGesture === null) {
      decide();
      return;
    }
    pending = decide;
    gestureWaiters.add(decide);
  };
  const stopPending = () => {
    if (pending) gestureWaiters.delete(pending);
    pending = null;
  };
  if (!arrivalHolds(html)) {
    settle(false);
    return stopPending;
  }
  const onEnded = (e: Event) => {
    if (arrivalHolds(html)) return;
    window.removeEventListener(EVENT_ENDED, onEnded);
    settle((e as CustomEvent<ArrivalEnded>).detail?.how === 'declined');
  };
  window.addEventListener(EVENT_ENDED, onEnded);
  return () => {
    window.removeEventListener(EVENT_ENDED, onEnded);
    stopPending();
  };
}

function mark(): void {
  touchVisit(Date.now());
}

function clearSwallow(): void {
  swallowClick = false;
  window.clearTimeout(swallowTimer);
}

function onKeyDown(e: KeyboardEvent): void {
  mark();
  const scroll = scrollKey(e);
  if (scroll) herScroll();
  if (activeRun) {
    activeRun.onKeyDown(e);
    return;
  }
  if (!cancelWait) return;
  const escape = e.key === 'Escape';
  if (escape) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  // Before the halt: it reports, and the landings read this on that same EVENT_ENDED.
  if (scroll) waitScrolled = true;
  haltWait(escape ? 'escape' : 'key');
}

/** A press during the wait ends it. On the hidden route root, the click it makes is swallowed:
 *  `arr-pre` is gone by then, and that click would act on what she could not see (arrival.js:778).
 *  Chrome stays visible under `arr-pre`, so a press on it stays live. A press the run swallowed
 *  (Acts 1–2, or a double in Act 3) never clicks either. */
function onPointerDown(e: PointerEvent): void {
  mark();
  clearSwallow();
  pressHeld = false;
  pressRun = null;
  if (activeRun) {
    const run = activeRun;
    run.onPointerDown(e);
    pressHeld = e.defaultPrevented;
    if (pressHeld) pressRun = run;
    return;
  }
  if (!cancelWait) return;
  const target = e.target;
  if (target instanceof Element && target.closest('[data-arrival]')) swallowClick = true;
  // Before the halt: it reports, and the landings read this on that same EVENT_ENDED.
  if (e.pointerType === 'touch' || e.pointerType === 'pen') waitGesture = e.pointerId;
  haltWait('pointer');
}

function onPointerUp(e: PointerEvent): void {
  if (e.pointerId === waitGesture) closeGesture(false);
  const run = activeRun;
  const held = pressHeld ? pressRun : null;
  const mouse = e.pointerType === 'mouse';
  const before = run?.phase;
  // The run ended under the press (its hold ran out, a guard fired): the release is still its own,
  // and a press on its act forwards the act's one click. The native click that follows is swallowed.
  if (held && held !== run) held.onPointerUp(e);
  run?.onPointerUp(e);
  // A mouse released on the act ends the run here and its own click is the act's activation. A
  // tap's click lands where the finger was after the act went home, so the run forwarded one.
  const toAct = mouse && before !== undefined && before !== 'done' && run?.phase === 'done';
  if (pressHeld && !toAct) swallowClick = true;
  pressHeld = false;
  pressRun = null;
  if (swallowClick) swallowTimer = window.setTimeout(clearSwallow, mouse ? 0 : TAP_CLICK_MS);
}

/** The browser took the press over: no click follows. A press that ended the wait was her pan. */
function onPointerCancel(e: PointerEvent): void {
  if (e.pointerId === waitGesture) closeGesture(true);
  clearSwallow();
  pressHeld = false;
  pressRun = null;
}

function onWheel(e: WheelEvent): void {
  mark();
  herScroll();
  if (activeRun) activeRun.onWheel(e);
  else haltWait('wheel');
}

function onTouchMove(e: TouchEvent): void {
  mark();
  herScroll();
  closeGesture(true);
  if (activeRun) activeRun.onTouchMove(e);
  else haltWait('touchmove');
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

// ── The host's own finishes (CONTRACT §4b): the frozen Run has no hook for these (arrival.js:848-863).

/** The page is leaving: nothing may stay hidden, staged or inert behind it, nor come back so. */
function onPageHide(): void {
  haltWait('pagehide');
  activeRun?.finish('hidden-tab');
}

/** A BFCache restore: the run that went into the cache comes back at rest. */
function onPageShow(e: PageTransitionEvent): void {
  if (!e.persisted) return;
  haltWait('pageshow');
  activeRun?.finish('hidden-tab');
}

/** Print the resting page, never the card's staging. */
function onBeforePrint(): void {
  haltWait('beforeprint');
  activeRun?.finish('mutation');
}

/** Selecting text in Acts 1–2 is her hand on the page; Act 3 is never cancelled by a selection. */
function onSelectionChange(): void {
  const run = activeRun;
  if (!run || (run.phase !== 'compose' && run.phase !== 'hold')) return;
  const selection = document.getSelection();
  if (selection && !selection.isCollapsed) run.finish('input');
}

/** The motion she asked for changed under the run: the page at rest, either way. */
function onReducedMotionChange(): void {
  haltWait('reduced-motion');
  activeRun?.finish('mutation');
}

function watchReducedMotion(): void {
  let query: MediaQueryList | undefined;
  try {
    query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  } catch {
    return;
  }
  if (!query) return;
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onReducedMotionChange);
  } else if (typeof query.addListener === 'function') {
    query.addListener(onReducedMotionChange);
  }
}

const TOKEN_LINKS =
  '[data-register="act"] a, [data-roster-name], [data-claim-card] a[href^="/doc/"]';

function onClick(e: MouseEvent): void {
  if (swallowClick) {
    clearSwallow();
    e.preventDefault();
    e.stopImmediatePropagation();
    // The click the run kept its press inert for has landed; its own release sits behind this.
    document.documentElement.classList.remove('arr-press');
    return;
  }
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
  window.addEventListener('pointercancel', onPointerCancel, { capture: true });
  window.addEventListener('focusin', onFocusIn, active);
  window.addEventListener('click', onClick, active);
  // The mockup's wheel/touch handlers never preventDefault; a non-passive window touchmove
  // would cost every page's scroll.
  window.addEventListener('wheel', onWheel, passive);
  window.addEventListener('touchmove', onTouchMove, passive);
  window.addEventListener('scroll', onScroll, passive);
  window.addEventListener('visibilitychange', onVisibilityChange, { capture: true });
  window.addEventListener('popstate', onPopState, { capture: true });
  window.addEventListener('pagehide', onPageHide, { capture: true });
  window.addEventListener('pageshow', onPageShow, { capture: true });
  window.addEventListener('beforeprint', onBeforePrint, { capture: true });
  document.addEventListener('selectionchange', onSelectionChange);
  watchReducedMotion();
}

const DESK_READY = '[data-arrival="desk"][data-arrival-ready]';

export function ArrivalMount(): null {
  installArrivalListeners();
  const pathname = usePathname();
  // Refs survive StrictMode's simulated remount: one nav entry and one pl-from-doc read per commit.
  const enteredRef = useRef<string | null>(null);
  const fromDocRef = useRef<{ id: string | null } | null>(null);

  useLayoutEffect(() => {
    if (enteredRef.current === pathname) return;
    enteredRef.current = pathname;
    if (isBareDocumentRoute(pathname)) enterRoute(pathname);
  }, [pathname]);

  // The put-down's row: spent at the Desk's commit, landed only if the Desk's arrival did not play
  // (afterArrival), once the Desk is ready, one frame after Next's own post-navigation scroll. Her
  // own wheel, swipe or scroll key before it has run drops it (herScroll).
  useEffect(() => {
    if (pathname !== '/desk') {
      fromDocRef.current = null;
      return;
    }
    if (fromDocRef.current === null) fromDocRef.current = { id: consumeFromDoc(Date.now()) };
    const pending = fromDocRef.current;
    if (pending.id === null) return;
    let frame = 0;
    let timer = 0;
    let observer: MutationObserver | null = null;
    let landed = false;
    // Never clears pending.id: StrictMode's simulated remount lands on the second pass.
    const stopWatching = () => {
      observer?.disconnect();
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      if (cancelLanding === drop) cancelLanding = null;
    };
    const drop = () => {
      pending.id = null;
      stopWatching();
    };
    const land = () => {
      if (landed || !document.querySelector(DESK_READY)) return;
      landed = true;
      observer?.disconnect();
      window.clearTimeout(timer);
      frame = window.requestAnimationFrame(() => {
        if (cancelLanding === drop) cancelLanding = null;
        const id = pending.id;
        pending.id = null;
        if (id) document.getElementById(`roster-line-${id}`)?.scrollIntoView({ block: 'center' });
      });
    };
    const stop = afterArrival((unplayed) => {
      if (!unplayed) {
        pending.id = null;
        return;
      }
      cancelLanding = drop;
      land();
      if (landed) return;
      observer = new MutationObserver(land);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-arrival', 'data-arrival-ready'],
      });
      timer = window.setTimeout(stopWatching, BUDGET.HARD_ENTRY_READY_MS);
    });
    return () => {
      stop();
      stopWatching();
    };
  }, [pathname]);

  return null;
}
