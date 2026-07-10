'use client';

/**
 * The Desk Walkthrough (R97) — the desk-first intro tour. A WelcomeModal plus a
 * six-step coachmark sequence that NEVER leaves `/desk` (a step routing into
 * `/doc/` would auto-start the R4 timer, which must never lie — Design 1). This
 * component is mounted once in the (document) layout and self-guards to the
 * Desk; on every other surface it renders nothing.
 *
 * Responsibilities:
 *   · Fresh signups (created_at ≥ ship date) get the auto-opening WelcomeModal
 *     the first time they land on a resolved desktop `/desk`.
 *   · Declining the modal (Explore / Skip / Esc / backdrop) writes the tour
 *     record as abandoned@0 — cross-device, so it never re-offers on any device.
 *   · Existing designers (created_at < ship date) never get the modal; the Desk
 *     shows them a quiet margin-note offer (rendered in desk/page.tsx, gated by
 *     `useDeskWalkthroughOffer`) whose action dispatches
 *     `document:start-desk-walkthrough`, which this component turns into a start.
 *   · Replay: `/desk?tour=desk-walkthrough` (⌘K "Take the walkthrough" / the
 *     pinned /help row) → `restart()` + strip the param.
 *   · Pause: the ⌘K palette dispatches `document:command-bar-opened/closed`;
 *     while open the tour is `paused` so Enter/Esc don't leak through.
 *   · The `desk-first-touch` margin note is suppressed (via context) while the
 *     modal or tour is on screen, and marked seen on completion (the tour taught
 *     ⌘K, so the note has nothing left to teach).
 *
 * Every content lookup carries a hard-coded fallback (per step / the modal) so a
 * Sanity outage or pre-publish state can NEVER render an invisible, un-advanceable
 * tour (spec §13.4). D4: the popover ships a `shadow-lg`; we override it to paper
 * with `shadow-none` via `coachmarkClassName`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useProfile } from '@patina/supabase';
import {
  SurfaceKeys,
  TourController,
  WelcomeModal,
  getTourState,
  setTourState,
  type CoachmarkStep,
  type TourControllerAPI,
  type TourState,
} from '@patina/help-system';
import { useDeskEngagements } from '@/hooks/use-desk-engagements';
import { documentEvents } from '@/lib/analytics/document-events';
import { markMarginNoteSeen } from '@/components/document/margin-note';
import { useHelpState } from './help-state-provider';
import {
  DESK_WALKTHROUGH_TOUR_ID,
  hasDeskWalkthroughReplayParam,
  shouldAutoOpenDeskWalkthrough,
  shouldOfferDeskWalkthrough,
} from './desk-walkthrough-gate';

// ─── The window event the margin-note offer uses to start the tour ────────────
//
// The offer note lives in the Desk's margin (desk/page.tsx); its action
// dispatches this. This component listens and starts the tour with source
// 'margin_note'. The note itself also recedes on this event (its actionEvents).
export const START_DESK_WALKTHROUGH_EVENT = 'document:start-desk-walkthrough';

// ─── D4 paper styling for the coachmark popover ───────────────────────────────
//
// The package popover defaults to `bg-primary … shadow-lg`. `twMerge` (inside
// TourController) means these later classes win: paper ink border, aged desk
// paper, body ink, and — the D4 non-negotiable — no drop. `shadow-none` is a
// negation, not a shadow.
const COACHMARK_CLASSNAME =
  'rounded-[6px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] text-[var(--text-body)] shadow-none';

// ─── Step 3 scroll (reduced-motion aware) ─────────────────────────────────────
async function scrollContentsIntoView(): Promise<void> {
  if (typeof document === 'undefined') return;
  const el = document.querySelector('[data-tour-anchor="desk-contents"]');
  if (!(el instanceof HTMLElement)) return;
  const reduce =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
}

// ─── The six steps ────────────────────────────────────────────────────────────
//
// Module-scope + stable so TourController's memo deps don't churn. The RATIFIED
// fallback copy makes the tour navigable with zero published CMS content; Sanity
// copy (persona 'designer') wins when present. (Step 6's "To work" CTA label is
// CMS-only — the CoachmarkStep type carries no fallback ctaLabel, so the package
// default "Done" shows during CMS downtime.)
const TOUR = SurfaceKeys.DesignerPortal.Tours.DeskWalkthrough;
const STEPS: CoachmarkStep[] = [
  {
    surfaceKey: TOUR.Step1TheDesk,
    anchorSelector: '[data-tour-anchor="desk-needs-your-hand"]',
    side: 'bottom',
    fallbackHeading: 'The Desk',
    fallbackBody:
      'Only what needs your hand lands here — a folder, one need line. Quiet means the work is in motion.',
  },
  {
    surfaceKey: TOUR.Step2TheFolder,
    anchorSelector: '[data-tour-anchor="desk-folio"]',
    side: 'bottom',
    fallbackHeading: 'One client, one document',
    fallbackBody:
      'Every client’s work lives in one document. When it needs you, it lands here as a folder — pick it up.',
  },
  {
    surfaceKey: TOUR.Step3TheStudio,
    anchorSelector: '[data-tour-anchor="desk-contents"]',
    side: 'top',
    beforeShow: scrollContentsIntoView,
    fallbackHeading: 'Rooms and ledgers',
    fallbackBody:
      'The Library and People are rooms you walk into. Orders, Accounts, Hours slide over as sheets — Esc puts them back.',
  },
  {
    surfaceKey: TOUR.Step4TheDrawer,
    anchorSelector: '[data-tour-anchor="studio-drawer"]',
    side: 'top',
    fallbackHeading: 'The studio drawer',
    fallbackBody:
      'The studio’s doors, always at the bottom. Hours log themselves while a document is in hand. The bell opens The Post.',
  },
  {
    surfaceKey: TOUR.Step5FindAnything,
    anchorSelector: '[data-tour-anchor="desk-find-anything"]',
    side: 'bottom',
    fallbackHeading: 'Find anything',
    fallbackBody:
      '⌘K reaches any folder, person, or book by name — try “invoice”. It can also ask the Engine.',
  },
  {
    surfaceKey: TOUR.Step6Begin,
    anchorSelector: '[data-tour-anchor="desk-capture-lead"]',
    side: 'bottom',
    fallbackHeading: 'Begin with a lead',
    fallbackBody:
      'Every project begins as a captured lead — a name and a note, under a minute. The Desk takes it from there.',
  },
];

// ─── Suppression + offer context (shared with desk/page.tsx) ──────────────────

interface DeskWalkthroughContextValue {
  /** True while the modal or the tour is on screen — desk/page holds the
   *  desk-first-touch note during it. */
  suppressFirstTouch: boolean;
  setSuppressFirstTouch: (value: boolean) => void;
  /** True when the existing-designer offer is eligible to render (the primitive
   *  additionally self-guards to once-only). */
  offerEligible: boolean;
  setOfferEligible: (value: boolean) => void;
}

const DeskWalkthroughContext = createContext<DeskWalkthroughContextValue>({
  suppressFirstTouch: false,
  setSuppressFirstTouch: () => undefined,
  offerEligible: false,
  setOfferEligible: () => undefined,
});

/**
 * Wraps the Desk region so the machinery (mounted as a sibling of the page) can
 * publish suppression + offer state that desk/page.tsx reads.
 */
export function DeskWalkthroughProvider({ children }: { children: ReactNode }) {
  const [suppressFirstTouch, setSuppressFirstTouch] = useState(false);
  const [offerEligible, setOfferEligible] = useState(false);
  const value = useMemo<DeskWalkthroughContextValue>(
    () => ({ suppressFirstTouch, setSuppressFirstTouch, offerEligible, setOfferEligible }),
    [suppressFirstTouch, offerEligible],
  );
  return (
    <DeskWalkthroughContext.Provider value={value}>{children}</DeskWalkthroughContext.Provider>
  );
}

/** desk/page.tsx — whether to suppress the desk-first-touch margin note. */
export function useSuppressDeskFirstTouch(): boolean {
  return useContext(DeskWalkthroughContext).suppressFirstTouch;
}

/** desk/page.tsx — whether the existing-designer walkthrough offer may render. */
export function useDeskWalkthroughOffer(): boolean {
  return useContext(DeskWalkthroughContext).offerEligible;
}

// ─── The machinery ────────────────────────────────────────────────────────────

/**
 * Mounted once in the (document) layout. Self-guards to `/desk` — everything
 * heavy (data hooks, the tour) lives in the inner component so it only runs
 * there.
 */
export function DeskWalkthrough() {
  const pathname = usePathname();
  if (pathname !== '/desk') return null;
  return <DeskWalkthroughInner />;
}

function DeskWalkthroughInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { helpStateReady } = useHelpState();
  const { setSuppressFirstTouch, setOfferEligible } = useContext(DeskWalkthroughContext);
  const { data: profile } = useProfile();
  const { isLoading: engagementsLoading } = useDeskEngagements();

  const [isDesktop, setIsDesktop] = useState(false);
  const [tourRecord, setTourRecord] = useState<TourState>({});
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [commandBarOpen, setCommandBarOpen] = useState(false);
  const [startRequested, setStartRequested] = useState<'first_signin' | 'margin_note' | null>(null);

  const tourApiRef = useRef<TourControllerAPI | null>(null);
  const autoDecidedRef = useRef(false); // the auto-modal fires at most once per mount
  const replayHandledRef = useRef(false); // the ?tour= param is consumed once
  const modalOutcomeRef = useRef<'start' | 'decline' | null>(null);

  // ── ≥980px (SSR-safe; read after mount) ────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(min-width: 980px)');
    const apply = () => setIsDesktop(mql.matches);
    apply();
    mql.addEventListener?.('change', apply);
    return () => mql.removeEventListener?.('change', apply);
  }, []);

  // ── Read the persisted record once the cross-device state is known ──────────
  useEffect(() => {
    if (!helpStateReady) return;
    setTourRecord(getTourState(DESK_WALKTHROUGH_TOUR_ID));
  }, [helpStateReady]);

  // ── ⌘K palette pause ────────────────────────────────────────────────────────
  useEffect(() => {
    const onOpen = () => setCommandBarOpen(true);
    const onClose = () => setCommandBarOpen(false);
    window.addEventListener('document:command-bar-opened', onOpen);
    window.addEventListener('document:command-bar-closed', onClose);
    return () => {
      window.removeEventListener('document:command-bar-opened', onOpen);
      window.removeEventListener('document:command-bar-closed', onClose);
    };
  }, []);

  // ── Replay: /desk?tour=desk-walkthrough → restart() + strip the param ───────
  // Reactive (not mount-only) so the ⌘K "Take the walkthrough" row works even
  // when the designer is already standing on /desk (router.push adds the param
  // without remounting). The guard resets once the param clears so a later
  // replay fires again.
  useEffect(() => {
    if (!hasDeskWalkthroughReplayParam(searchParams?.toString() ?? '')) {
      replayHandledRef.current = false;
      return;
    }
    if (replayHandledRef.current) return;
    replayHandledRef.current = true;
    autoDecidedRef.current = true; // a replay pre-empts the auto-modal
    const api = tourApiRef.current;
    if (api) {
      api.restart();
      setTourActive(true);
      documentEvents.wayfinding.walkthroughStarted({ source: 'command_bar' });
    }
    router.replace('/desk');
  }, [searchParams, router]);

  // ── Auto-modal decision for fresh signups ───────────────────────────────────
  useEffect(() => {
    if (autoDecidedRef.current) return;
    const open = shouldAutoOpenDeskWalkthrough({
      helpStateReady,
      tourState: tourRecord,
      profileCreatedAt: profile?.created_at,
      pathname: '/desk',
      engagementsResolved: !engagementsLoading,
      isDesktop,
    });
    if (open) {
      autoDecidedRef.current = true;
      modalOutcomeRef.current = null;
      setWelcomeOpen(true);
    }
  }, [helpStateReady, tourRecord, profile?.created_at, engagementsLoading, isDesktop]);

  // ── Existing-designer offer eligibility (desk/page renders the note) ────────
  useEffect(() => {
    setOfferEligible(
      shouldOfferDeskWalkthrough({
        helpStateReady,
        tourState: tourRecord,
        profileCreatedAt: profile?.created_at,
        pathname: '/desk',
        engagementsResolved: !engagementsLoading,
        isDesktop,
      }),
    );
  }, [
    helpStateReady,
    tourRecord,
    profile?.created_at,
    engagementsLoading,
    isDesktop,
    setOfferEligible,
  ]);

  // ── Publish first-touch suppression + reset it on leave ─────────────────────
  useEffect(() => {
    setSuppressFirstTouch(welcomeOpen || tourActive);
  }, [welcomeOpen, tourActive, setSuppressFirstTouch]);
  useEffect(
    () => () => {
      setSuppressFirstTouch(false);
      setOfferEligible(false);
    },
    [setSuppressFirstTouch, setOfferEligible],
  );

  // ── Start the tour from the margin-note offer ───────────────────────────────
  useEffect(() => {
    const onStart = () => {
      const api = tourApiRef.current;
      if (!api || api.isActive) return;
      api.start();
      setTourActive(true);
      documentEvents.wayfinding.walkthroughStarted({ source: 'margin_note' });
    };
    window.addEventListener(START_DESK_WALKTHROUGH_EVENT, onStart);
    return () => window.removeEventListener(START_DESK_WALKTHROUGH_EVENT, onStart);
  }, []);

  // ── Flush a start() requested by the WelcomeModal's primary CTA ─────────────
  // (The modal closes itself after onStartTour; starting on the next tick lets
  // the controller fire help.tour.started + init its timer the same as prod.)
  useEffect(() => {
    if (!startRequested) return;
    const api = tourApiRef.current;
    if (!api) return;
    if (!api.isActive) api.start();
    setTourActive(true);
    documentEvents.wayfinding.walkthroughStarted({ source: startRequested });
    setStartRequested(null);
  }, [startRequested]);

  // ── Modal CTA / dismiss handlers ────────────────────────────────────────────
  const declineWalkthrough = useCallback(() => {
    // Cross-device decline: write the tour record as abandoned@0 so no device
    // ever re-offers (a local "welcome-shown" marker wouldn't travel).
    setTourState(DESK_WALKTHROUGH_TOUR_ID, { abandoned: true, atStep: 0 });
    setTourRecord({ abandoned: true, atStep: 0 });
  }, []);

  const handleStartTour = useCallback(() => {
    modalOutcomeRef.current = 'start';
    setStartRequested('first_signin');
  }, []);

  const handleSkip = useCallback(() => {
    modalOutcomeRef.current = 'decline';
    declineWalkthrough();
  }, [declineWalkthrough]);

  const handleWelcomeOpenChange = useCallback(
    (open: boolean) => {
      setWelcomeOpen(open);
      if (!open) {
        // A pure dismiss (Esc / backdrop) records no CTA outcome — treat it as
        // declining the walkthrough so it never re-offers.
        if (modalOutcomeRef.current === null) declineWalkthrough();
        modalOutcomeRef.current = null;
      }
    },
    [declineWalkthrough],
  );

  // ── Tour lifecycle ──────────────────────────────────────────────────────────
  const handleComplete = useCallback(() => {
    setTourActive(false);
    setTourRecord({ completed: true });
    // The tour taught ⌘K — retire the desk first-touch note so it never shows.
    markMarginNoteSeen('desk-first-touch');
  }, []);

  const handleAbandon = useCallback(() => {
    setTourActive(false);
    setTourRecord((prev) => ({ ...prev, abandoned: true }));
  }, []);

  return (
    <>
      <WelcomeModal
        surfaceKey={SurfaceKeys.DesignerPortal.Document.Welcome}
        open={welcomeOpen}
        onOpenChange={handleWelcomeOpenChange}
        onStartTour={handleStartTour}
        onSkip={handleSkip}
        persona="designer"
        fallbackTitle="This is your Desk"
        fallbackBody="Every client’s project is one document, and every document lives here. Six stops, about a minute, and you’ll know your way around. You can leave at any step."
        className="shadow-none"
      />

      <TourController
        tourId={DESK_WALKTHROUGH_TOUR_ID}
        steps={STEPS}
        persona="designer"
        paused={commandBarOpen}
        coachmarkClassName={COACHMARK_CLASSNAME}
        onComplete={handleComplete}
        onAbandon={handleAbandon}
      >
        {(api) => {
          tourApiRef.current = api;
          return <api.CoachmarkSlot />;
        }}
      </TourController>
    </>
  );
}
