'use client';

/**
 * US-14 arrival — one route's arrival (CONTRACT §3 "Hide/ready/budgets"). Keyed by pathname, so
 * each route commit gets a fresh run: gate at the commit, hide the route root, wait for the page's
 * own ready mark + quiet + faces inside the caps, then hand the engine a run. Every failure is the
 * ordinary page.
 */
import { useLayoutEffect, useRef } from 'react';
import { callSheetPending } from '@/components/document/command-bar';
import { useSuppressDeskFirstTouch } from '@/components/document/help/desk-walkthrough';
import { useDocumentTime } from '@/hooks/document-time-provider';
import { createHost } from '@/lib/arrival/host';
import { docIdOf, enterRoute } from '@/lib/arrival/nav';
import type { ArrivalEngine, Run } from '@/lib/arrival/run-contract';
import {
  consumeArriveToken,
  markVisit,
  readArriveToken,
  readDeskShown,
  readE2eOptIn,
  readVisit,
  setDeskShown,
} from '@/lib/arrival/session';
import { BUDGET, EVENT_ENDED, SENTINEL } from '@/lib/arrival/types';
import type {
  ArrivalEnded,
  DeclineCause,
  GateInput,
  GateResult,
  Surface,
} from '@/lib/arrival/types';
import { getActiveRun, setActiveRun, setArrivalWaiting } from './arrival-mount';

export interface ArrivalRunProps {
  engine: ArrivalEngine;
  pathname: string;
}

interface Entry {
  input: GateInput;
  hard: boolean;
  result: GateResult;
  callSheet: boolean;
}

function surfaceOf(pathname: string): Surface | null {
  if (pathname === '/desk') return 'desk';
  return docIdOf(pathname) ? 'document' : null;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function sentinelPresent(): boolean {
  try {
    return (
      window.getComputedStyle(document.documentElement).getPropertyValue(SENTINEL).trim() === '1'
    );
  } catch {
    return false;
  }
}

/** Every card face loaded, or false within FONTS_MS (the mockup's FACES, arrival.js:868-874). */
function loadFaces(families: string[]): Promise<boolean> {
  const fonts = document.fonts;
  const [display, body, meta] = families;
  const specs = [
    `500 34px ${display}`,
    `500 20px ${display}`,
    `400 16px ${body}`,
    `400 14px ${body}`,
    `400 11px ${meta}`,
    `500 11px ${meta}`,
  ];
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(false), BUDGET.FONTS_MS);
    const settle = (ok: boolean) => {
      window.clearTimeout(timer);
      resolve(ok);
    };
    try {
      Promise.all(specs.map((spec) => fonts.load(spec))).then(
        (loaded) =>
          settle(
            loaded.every((faces) => faces.length > 0) && specs.every((spec) => fonts.check(spec)),
          ),
        () => settle(false),
      );
    } catch {
      settle(false);
    }
  });
}

export function ArrivalRun({ engine, pathname }: ArrivalRunProps): null {
  const { offer } = useDocumentTime();
  const walkthroughOnScreen = useSuppressDeskFirstTouch();
  const offerRef = useRef(false);
  const walkthroughRef = useRef(false);
  offerRef.current = offer !== null;
  walkthroughRef.current = walkthroughOnScreen;

  // Refs survive StrictMode's simulated remount: the commit is classified and gated once, the
  // route reports once, and the ready writes happen once.
  const entryRef = useRef<Entry | null>(null);
  const reportedRef = useRef(false);
  const stampedRef = useRef(false);
  const runRef = useRef<Run | null>(null);

  useLayoutEffect(() => {
    const surface = surfaceOf(pathname);
    if (!surface) return;
    const engagementId = surface === 'document' ? docIdOf(pathname) : null;
    const host = createHost(surface, engagementId, {
      walkthroughOnScreen: () => walkthroughRef.current,
      logOfferPending: () => offerRef.current,
    });
    const html = document.documentElement;

    // The one end-of-entry funnel: every end — played, or declined at the gate, the commit, a cap
    // or ready — reports once and writes the D3 anchor once.
    const report = (e: ArrivalEnded) => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      try {
        host.telemetry(e);
        window.dispatchEvent(new CustomEvent<ArrivalEnded>(EVENT_ENDED, { detail: e }));
      } catch {
        /* telemetry never breaks the page */
      }
      host.markArrival(surface, engagementId);
    };

    let entry = entryRef.current;
    if (!entry) {
      const now = Date.now();
      const route = enterRoute(pathname, now);
      // A refresh never inherits a token: spent here, before the page's own consumer mounts.
      if (route.hard) consumeArriveToken(pathname, now);
      // Read NOW: DeskDoorway's passive effect strips the query after this commit.
      const input: GateInput = {
        surface,
        pathname,
        search: window.location.search,
        hash: window.location.hash,
        entry: route.entry,
        entryAt: route.entryAt,
        now,
        webdriver: navigator.webdriver === true,
        e2eOptIn: readE2eOptIn(),
        visitAt: readVisit(),
        deskShown: readDeskShown(),
        token: route.hard ? null : readArriveToken(pathname, now),
        suppressedPath: route.suppressedPath,
        reducedMotion: prefersReducedMotion(),
      };
      let result: GateResult;
      try {
        result = engine.gate(input);
      } catch {
        result = { play: false, cause: 'error' };
      }
      // The ⌘K Call Sheet walk: the Document opens its sheet on mount and clears the flag.
      entry = { input, hard: route.hard, result, callSheet: callSheetPending.value };
      entryRef.current = entry;
    }
    if (reportedRef.current || runRef.current) return;

    const declineNow = (cause: DeclineCause) =>
      report({ surface, how: 'declined', cause });

    const { input, result } = entry;
    if (!result.play) return declineNow(result.cause);
    if (entry.callSheet) return declineNow('busy');
    if (
      typeof MutationObserver === 'undefined' ||
      !document.fonts ||
      typeof document.fonts.load !== 'function'
    ) {
      return declineNow('unsupported');
    }
    if (!sentinelPresent()) return declineNow('sentinel');
    const cap = entry.hard ? BUDGET.HARD_ENTRY_READY_MS : BUDGET.SOFT_ENTRY_READY_MS;
    const left = cap - (Date.now() - input.entryAt);
    if (left <= 0) return declineNow('late');

    let waitingNow = true;
    let watch: MutationObserver | null = null;
    let quiet: MutationObserver | null = null;
    let quietRoot: HTMLElement | null = null;
    let quietDone = false;
    let rootSeen = false;
    let faces: 'idle' | 'pending' | 'ok' = 'idle';
    let quietTimer = 0;
    let hiddenTimer = 0;
    let entryTimer = 0;

    const stopQuiet = () => {
      quiet?.disconnect();
      quiet = null;
      quietRoot = null;
      quietDone = false;
      window.clearTimeout(quietTimer);
    };

    const endWait = () => {
      waitingNow = false;
      watch?.disconnect();
      watch = null;
      stopQuiet();
      window.clearTimeout(hiddenTimer);
      window.clearTimeout(entryTimer);
      setArrivalWaiting(null);
    };

    const decline = (cause: DeclineCause) => {
      if (!waitingNow) return;
      endWait();
      html.classList.remove('arr-pre');
      report({ surface, how: 'declined', cause });
    };

    const begin = (root: HTMLElement) => {
      if (document.visibilityState === 'hidden') return decline('hidden');
      if (host.busy()) return decline('busy');
      let brief: ReturnType<ArrivalEngine['brief']>;
      try {
        brief = engine.brief(root, surface);
      } catch {
        return decline('error');
      }
      if (!brief) return decline('no-headline');
      let run: Run;
      try {
        run = engine.createRun(brief, host, {
          via: result.via,
          reduced: result.reduced,
          entryAt: input.entryAt,
          now: () => Date.now(),
        });
      } catch {
        return decline('error');
      }
      let stampAt: number | null = null;
      if (!stampedRef.current) {
        stampedRef.current = true;
        stampAt = Date.now();
        markVisit(stampAt);
        consumeArriveToken(pathname, stampAt);
      }
      endWait();
      runRef.current = run;
      setActiveRun(run);
      run.ended.then(
        (e) => {
          report(e);
          if (getActiveRun() === run) setActiveRun(null);
        },
        () => {
          if (getActiveRun() === run) setActiveRun(null);
        },
      );
      let started = true;
      try {
        run.start();
      } catch {
        started = false;
        try {
          run.finish('error');
        } catch {
          /* finish restores in its own finally */
        }
      }
      // Only a Desk that actually played spends the visit's Desk (arrival.js:890): a decline
      // inside start() (drift, no-root) costs nothing.
      if (started && stampAt !== null && surface === 'desk' && run.phase !== 'done') {
        setDeskShown(stampAt);
      }
    };

    const maybeBegin = () => {
      if (!waitingNow || !quietDone || faces !== 'ok') return;
      const root = host.root();
      if (!root || !host.ready()) return;
      begin(root);
    };

    const restartQuiet = () => {
      quietDone = false;
      window.clearTimeout(quietTimer);
      quietTimer = window.setTimeout(() => {
        quietDone = true;
        maybeBegin();
      }, BUDGET.QUIET_MS);
    };

    const check = () => {
      if (!waitingNow) return;
      const root = host.root();
      if (root && !rootSeen) {
        rootSeen = true;
        hiddenTimer = window.setTimeout(() => decline('hidden'), BUDGET.HIDDEN_CAP_MS);
      }
      if (!root || !host.ready()) {
        stopQuiet();
        return;
      }
      if (faces === 'idle') {
        faces = 'pending';
        void loadFaces(host.faces()).then((ok) => {
          if (!waitingNow) return;
          if (!ok) return decline('fonts');
          faces = 'ok';
          maybeBegin();
        });
      }
      if (quietRoot !== root) {
        stopQuiet();
        quietRoot = root;
        quiet = new MutationObserver(restartQuiet);
        quiet.observe(root, { childList: true, characterData: true, subtree: true });
        restartQuiet();
      }
    };

    html.classList.add('arr-pre');
    // Her hand during the wait ends it for good. DeclineCause has no 'input' member (types.ts is
    // frozen); 'busy' is the nearest.
    setArrivalWaiting(() => decline('busy'));
    entryTimer = window.setTimeout(() => decline('late'), left);
    watch = new MutationObserver(check);
    watch.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-arrival', 'data-arrival-ready'],
    });
    check();

    return () => {
      if (waitingNow) endWait();
      const run = runRef.current;
      if (run) {
        if (run.phase !== 'done') run.finish('mutation');
        if (getActiveRun() === run) setActiveRun(null);
      }
      html.classList.remove('arr-pre');
    };
  }, [engine, pathname]);

  return null;
}
