'use client';

/**
 * US-14 arrival — one route's arrival (CONTRACT §3 "Hide/ready/budgets"). Keyed by pathname, so
 * each route commit gets a fresh run: gate at the commit, hide the route root, wait for the page's
 * own ready mark + quiet + faces inside the caps, then hand the engine a run. Every failure is the
 * ordinary page.
 */
import { useLayoutEffect, useRef } from 'react';
import {
  callSheetPending,
  captureLeadPending,
  openProjectPending,
} from '@/components/document/command-bar';
import { useSuppressDeskFirstTouch } from '@/components/document/help/desk-walkthrough';
import { useDocumentTime } from '@/hooks/document-time-provider';
import { loadFaces } from '@/lib/arrival/faces';
import { createHost } from '@/lib/arrival/host';
import { docIdOf, enterRoute, noteDocEngagement } from '@/lib/arrival/nav';
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
import {
  beginEntry,
  getActiveRun,
  noteRunStarted,
  setActiveRun,
  setArrivalWaiting,
} from './arrival-mount';
import type { WaitHalt } from './arrival-mount';

export interface ArrivalRunProps {
  engine: ArrivalEngine;
  pathname: string;
}

interface Entry {
  input: GateInput;
  hard: boolean;
  result: GateResult;
  /** A sheet flagged to open on this route's mount (⌘K's Call Sheet, capture-lead, open-project). */
  busy: boolean;
}

/** A wait ended by anything but Escape declines. DeclineCause has no 'input' member (types.ts is
 *  frozen): her hand is 'busy'; the page leaving or coming back from the BFCache is 'hidden', never
 *  'busy'; printing is 'busy'; her motion setting changing is 'unsupported'. */
const WAIT_DECLINE: Record<Exclude<WaitHalt, 'escape'>, DeclineCause> = {
  key: 'busy',
  pointer: 'busy',
  wheel: 'busy',
  touchmove: 'busy',
  pagehide: 'hidden',
  pageshow: 'hidden',
  beforeprint: 'busy',
  'reduced-motion': 'unsupported',
};

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
  const routedRef = useRef(false);
  /** An abandoned wait's report, deferred one microtask so StrictMode's re-run can take it back. */
  const abandonRef = useRef<{ cancelled: boolean } | null>(null);

  useLayoutEffect(() => {
    if (abandonRef.current) {
      abandonRef.current.cancelled = true;
      abandonRef.current = null;
    }
    const surface = surfaceOf(pathname);
    if (!surface) {
      if (!routedRef.current) {
        routedRef.current = true;
        enterRoute(pathname);
      }
      return;
    }
    const engagementId = surface === 'document' ? docIdOf(pathname) : null;
    const host = createHost(surface, engagementId, {
      walkthroughOnScreen: () => walkthroughRef.current,
      logOfferPending: () => offerRef.current,
    });
    const html = document.documentElement;

    // The one end-of-entry funnel: every end — played, or declined at the gate, the commit, a cap
    // or ready — reports once and writes the D3 anchor once. EVENT_ENDED goes out here only for a
    // decline before any run exists: the engine dispatches it itself for every run it created.
    const report = (e: ArrivalEnded, dispatch: boolean) => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      try {
        host.telemetry(e);
      } catch {
        /* telemetry never breaks the page */
      }
      if (dispatch) {
        try {
          window.dispatchEvent(new CustomEvent<ArrivalEnded>(EVENT_ENDED, { detail: e }));
        } catch {
          /* the landings and the zone-flight clock wait on this; nothing here may stop it */
        }
      }
      host.markArrival(surface, engagementId);
    };

    let entry = entryRef.current;
    if (!entry) {
      beginEntry();
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
      // The walks that open a sheet on mount, each busy only on the surface whose page reads and
      // clears it after this commit: the Document's Call Sheet; the Desk's capture-lead and
      // open-project. A flag left standing for the other surface is not this entry's.
      const busy =
        surface === 'desk'
          ? captureLeadPending.value || openProjectPending.value
          : callSheetPending.value;
      entry = { input, hard: route.hard, result, busy };
      entryRef.current = entry;
    }

    // The Document names its engagement on its root (`data-arr-engagement`): a put-down from this
    // path writes that id, which the Desk's roster rows are keyed by.
    let engagementWatch: MutationObserver | null = null;
    const noteEngagement = (): boolean => {
      const id = host.root()?.getAttribute('data-arr-engagement');
      if (!id) return false;
      noteDocEngagement(pathname, id);
      return true;
    };
    if (surface === 'document' && !noteEngagement() && typeof MutationObserver !== 'undefined') {
      engagementWatch = new MutationObserver(() => {
        if (!noteEngagement()) return;
        engagementWatch?.disconnect();
        engagementWatch = null;
      });
      engagementWatch.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-arr-engagement'],
      });
    }
    const stopEngagementWatch = () => {
      engagementWatch?.disconnect();
      engagementWatch = null;
    };

    if (reportedRef.current || runRef.current) return stopEngagementWatch;

    const declineNow = (cause: DeclineCause) => {
      report({ surface, how: 'declined', cause }, true);
      return stopEngagementWatch;
    };

    const { input, result } = entry;
    if (!result.play) return declineNow(result.cause);
    if (entry.busy) return declineNow('busy');
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
      report({ surface, how: 'declined', cause }, true);
    };

    // Escape during the wait is "no ceremony" (the mockup's halt()): the ordinary page, reported
    // as her escape rather than a decline.
    const halt = () => {
      if (!waitingNow) return;
      endWait();
      html.classList.remove('arr-pre');
      report({ surface, how: 'escape' }, true);
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
          report(e, false);
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
      if (started && run.phase !== 'done') {
        noteRunStarted();
        // Only a Desk that actually played spends the visit's Desk (arrival.js:890): a decline
        // inside start() (drift, no-root) costs nothing.
        if (stampAt !== null && surface === 'desk') setDeskShown(stampAt);
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
        // A waiting page keeps its own loading state until ready, so this cap covers only quiet + faces.
        hiddenTimer = window.setTimeout(() => decline('hidden'), BUDGET.HIDDEN_CAP_MS);
      }
      if (!root || !host.ready()) {
        stopQuiet();
        return;
      }
      if (faces === 'idle') {
        faces = 'pending';
        void loadFaces(host).then((ok) => {
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
    // Her hand during the wait, or the page's own lifecycle, ends it for good.
    setArrivalWaiting((why) => (why === 'escape' ? halt() : decline(WAIT_DECLINE[why])), pathname);
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
      stopEngagementWatch();
      if (waitingNow) {
        endWait();
        // Unmounted or navigated away mid-wait: the entry ends as a navigation cut, once.
        const abandon = { cancelled: false };
        abandonRef.current = abandon;
        queueMicrotask(() => {
          if (abandon.cancelled) return;
          if (abandonRef.current === abandon) abandonRef.current = null;
          report({ surface, how: 'mutation' }, true);
        });
      }
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
