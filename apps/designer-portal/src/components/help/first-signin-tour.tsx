'use client';

/**
 * FirstSigninTour — Sprint 3 / Wave 9 / W1
 *
 * Wires the First Project Walkthrough into the designer-portal portal layout.
 *
 *  · On the user's very first signin (`auth.users.created_at` within a short
 *    window of "now"), show the WelcomeModal one time.
 *  · If they click "Start tour", launch the 5-step coachmark walkthrough via
 *    the TourController API's `start()` method (so `help.tour.started` fires
 *    and the duration timer initializes — see TourController source).
 *  · If they skip, dismiss, or close the modal, do nothing further.
 *  · The TourController itself is the source of truth for "this tour is over"
 *    — once it writes `completed: true` or `abandoned: true` to localStorage
 *    via the v1 tourState adapter, the modal will never re-appear.
 *  · The modal-shown bit is tracked under a separate localStorage key
 *    (`help-system.welcome-shown.<tourKey>`) because the Sprint 3 TourState
 *    shape (see packages/help-system/src/proactive/TourController/tourState.ts)
 *    intentionally only carries completion / abandonment markers. Both pieces
 *    of state migrate together to Supabase in Sprint 4.
 *
 * Spec references:
 *   §10   — analytics events fired by WelcomeModal + TourController
 *   §4.7  — tour rules (one-shot per user, persistence model, anchor semantics)
 *   §4.8  — welcome modal contract (exactly two CTAs, persona-aware copy)
 *   §13.4 — Sanity downtime must not crash the UI (fallback copy provided)
 *
 * Acceptance plan reference:
 *   .claude/plans/review-the-documenation-for-compressed-shore.md — Sprint 3
 *   gate criterion: "First Project Walkthrough completable end-to-end".
 */

import { useEffect, useRef, useState } from 'react';
import { useSession } from '@patina/supabase';
import {
  SurfaceKeys,
  TourController,
  type TourControllerAPI,
  WelcomeModal,
  getTourState,
} from '@patina/help-system';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOUR_KEY = 'first-project-walkthrough';

/**
 * Treat the user as "freshly signed up" when `auth.users.created_at` is within
 * this many milliseconds of the current time. 60s is intentionally narrow:
 *   · A returning user signing in from a different device will have a
 *     created_at far older than the window, so we won't ambush them.
 *   · A newly-confirmed email user lands here moments after activation, well
 *     inside the window.
 * Per spec §4.7 rule 1, the TourController itself enforces one-shot semantics
 * regardless of the window, so a slightly-late hit is still safe.
 */
const FIRST_SIGNIN_WINDOW_MS = 60_000;

/** localStorage key used to remember the welcome modal was shown for this tour. */
const WELCOME_SHOWN_STORAGE_KEY = `help-system.welcome-shown.${TOUR_KEY}`;

// ─── localStorage helpers (SSR-safe, never throw) ────────────────────────────

function readWelcomeShown(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(WELCOME_SHOWN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeWelcomeShown(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WELCOME_SHOWN_STORAGE_KEY, '1');
  } catch {
    // localStorage may be unavailable (private Safari, quota); silently skip.
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders the welcome modal + tour controller. Mount this once inside the
 * portal layout. Both surfaces are no-ops until the user satisfies the
 * first-signin gate and the tour has not already been completed/abandoned.
 */
export function FirstSigninTour() {
  // Use the underlying Supabase session directly so we can read
  // `user.created_at` — the wrapper @/hooks/use-auth strips that field.
  const { session } = useSession();
  const supabaseUser = session?.user ?? null;

  const [showWelcome, setShowWelcome] = useState(false);

  // Ref to the TourController's render-prop API. We call `start()` after the
  // welcome modal closes (rather than passing `active={true}`) so the
  // controller fires its `help.tour.started` event and initializes its
  // duration timer + viewedSteps tracking the same way it does in production.
  const tourApiRef = useRef<TourControllerAPI | null>(null);

  // Once the user clicks "Start tour" we set this to true; the next render
  // sees the ref filled and calls start(). The flag prevents repeated start
  // calls if the component re-renders for unrelated reasons.
  const [tourStartRequested, setTourStartRequested] = useState(false);

  useEffect(() => {
    if (!supabaseUser?.created_at) return;

    const createdAtMs = Date.parse(supabaseUser.created_at);
    if (Number.isNaN(createdAtMs)) return;

    const ageMs = Date.now() - createdAtMs;
    if (ageMs > FIRST_SIGNIN_WINDOW_MS) return;

    // Spec §4.7 rule 1: a tour that has been completed OR abandoned must
    // never auto-start again. Mirror the same gate on the welcome modal
    // so re-signing-in within the 60s window after skipping doesn't
    // ambush the user with another modal.
    const tourState = getTourState(TOUR_KEY);
    if (tourState.completed === true || tourState.abandoned === true) return;
    if (readWelcomeShown()) return;

    setShowWelcome(true);
  }, [supabaseUser]);

  // After the welcome modal closes with "Start tour", flush a start() call
  // through the TourController's imperative API.
  useEffect(() => {
    if (!tourStartRequested) return;
    const api = tourApiRef.current;
    if (!api) return;
    if (api.isActive) {
      // Already running — avoid double-start.
      setTourStartRequested(false);
      return;
    }
    api.start();
    setTourStartRequested(false);
  }, [tourStartRequested]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Whether the user clicked Start tour, Skip, or dismissed via Escape /
      // backdrop, we never want to re-show the modal — the user has now had
      // their orientation moment. Persist the "shown" marker on close.
      writeWelcomeShown();
    }
    setShowWelcome(open);
  };

  return (
    <>
      <WelcomeModal
        surfaceKey={SurfaceKeys.DesignerPortal.WelcomeModal}
        open={showWelcome}
        onOpenChange={handleOpenChange}
        onStartTour={() => {
          // WelcomeModal closes itself after this callback runs; the close
          // path will write the "shown" marker. Flag the tour for start so
          // the next render fires api.start() through tourApiRef.
          setTourStartRequested(true);
        }}
        onSkip={() => {
          // No-op beyond closing — handleOpenChange records the shown bit.
        }}
        persona="designer"
        fallbackTitle="Welcome to Patina"
        fallbackBody={
          "Let's get you oriented. We can walk through the essentials in " +
          'about 60 seconds, or you can dive in and explore.'
        }
      />

      <TourController
        tourId={TOUR_KEY}
        steps={[
          {
            surfaceKey:
              SurfaceKeys.DesignerPortal.Tours.FirstProjectWalkthrough
                .Step1Today,
            anchorSelector: '[data-tour-anchor="today"]',
          },
          {
            surfaceKey:
              SurfaceKeys.DesignerPortal.Tours.FirstProjectWalkthrough
                .Step2Pipeline,
            anchorSelector: '[data-tour-anchor="pipeline"]',
          },
          {
            surfaceKey:
              SurfaceKeys.DesignerPortal.Tours.FirstProjectWalkthrough
                .Step3Aesthete,
            anchorSelector: '[data-tour-anchor="aesthete"]',
          },
          {
            surfaceKey:
              SurfaceKeys.DesignerPortal.Tours.FirstProjectWalkthrough
                .Step4ProductsCapture,
            anchorSelector: '[data-tour-anchor="products"]',
          },
          {
            surfaceKey:
              SurfaceKeys.DesignerPortal.Tours.FirstProjectWalkthrough
                .Step5Profile,
            anchorSelector: '[data-tour-anchor="profile"]',
          },
        ]}
      >
        {(api) => {
          // Capture the imperative API so the "Start tour" effect can call
          // api.start() without holding the controller's child closure.
          tourApiRef.current = api;
          return <api.CoachmarkSlot />;
        }}
      </TourController>
    </>
  );
}
