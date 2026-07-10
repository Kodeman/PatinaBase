/**
 * The Desk Walkthrough — gate logic (R97), extracted pure so every decision is
 * unit-testable without mounting the (heavy) `@patina/help-system` barrel.
 *
 *   · shouldAutoOpenDeskWalkthrough — the fresh-signup WelcomeModal gate.
 *   · shouldOfferDeskWalkthrough    — the existing-designer margin-note offer.
 *   · hasDeskWalkthroughReplayParam — the ⌘K / Help replay entry (`?tour=…`).
 *
 * desk-walkthrough.tsx composes these with live React state (help-state
 * hydration, the desk query, matchMedia, the persisted tour record). Keeping
 * them here means the truth table lives in one place and is jest-covered.
 */

/** The identifier the TourController + the persisted `help_state.tours` use. */
export const DESK_WALKTHROUGH_TOUR_ID = 'desk-walkthrough';

/** The search-param that triggers a replay: `/desk?tour=desk-walkthrough`. */
export const DESK_WALKTHROUGH_REPLAY_PARAM = 'tour';

/**
 * The instant the Desk Walkthrough went live.
 *
 * Designers whose profile `created_at` is ON OR AFTER this get the auto-opening
 * WelcomeModal on their first `/desk`. Designers created BEFORE it are existing
 * users — they get the quiet margin-note offer instead, never an auto-modal
 * (the R97 ship-date rule that keeps the flip from ambushing anyone mid-work).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  ⚠  BUMP THIS TO THE ACTUAL PROD DEPLOY DATE (UTC) THE DAY THIS SHIPS.  ⚠
 *  Until then this placeholder greets only brand-new signups and keeps every
 *  real (older) designer on the quiet-offer path. Shipping without bumping it
 *  means anyone who signed up on/after the placeholder date gets the modal.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const DESK_WALKTHROUGH_SHIP_DATE = '2026-07-11T00:00:00Z';

/** The subset of the persisted `tours['desk-walkthrough']` record the gate
 *  reads. Declared locally so this module never imports the help-system barrel
 *  (its ESM would break the pure jest run). Matches `TourState` structurally. */
export interface DeskWalkthroughTourState {
  completed?: boolean;
  abandoned?: boolean;
}

export interface DeskWalkthroughGateInput {
  /** The Supabase help-state backend has hydrated — the cross-device tour
   *  record is known, so a completed/abandoned tour on another device is seen
   *  before we decide. Never decide before this is true. */
  helpStateReady: boolean;
  /** The persisted `tours['desk-walkthrough']` record (empty `{}` when none). */
  tourState: DeskWalkthroughTourState;
  /** profiles.created_at (ISO). null/undefined until the profile query resolves. */
  profileCreatedAt: string | null | undefined;
  /** The current pathname — the tour never leaves `/desk`. */
  pathname: string;
  /** The desk engagements query has resolved (not loading) — anchors don't
   *  exist while the desk is still reading. */
  engagementsResolved: boolean;
  /** `window.matchMedia('(min-width: 980px)').matches` — the tour needs the
   *  desktop desk layout. Below it: no modal AND no state written. */
  isDesktop: boolean;
}

/** A tour is resolved once completed OR abandoned — either way it must never
 *  auto-offer again (spec §4.7 rule 1). */
function tourResolved(state: DeskWalkthroughTourState): boolean {
  return state.completed === true || state.abandoned === true;
}

/** Parse `created_at` to epoch ms, or null when absent/unparseable. */
function createdAtMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Fresh-signup auto-modal gate. TRUE iff every clause holds:
 *   helpStateReady · no tour record · created_at ≥ ship date · on /desk ·
 *   desk query resolved · ≥980px.
 */
export function shouldAutoOpenDeskWalkthrough(input: DeskWalkthroughGateInput): boolean {
  const { helpStateReady, tourState, profileCreatedAt, pathname, engagementsResolved, isDesktop } =
    input;
  if (!helpStateReady) return false;
  if (tourResolved(tourState)) return false;
  const created = createdAtMs(profileCreatedAt);
  if (created === null) return false;
  if (created < Date.parse(DESK_WALKTHROUGH_SHIP_DATE)) return false; // existing → offer path
  if (pathname !== '/desk') return false;
  if (!engagementsResolved) return false;
  if (!isDesktop) return false;
  return true;
}

/**
 * Existing-designer offer gate. TRUE iff the designer predates the ship date,
 * has no tour record, is on `/desk`, on a desktop, and the help state is known.
 * (The MarginNote primitive additionally self-guards to once-only.)
 */
export function shouldOfferDeskWalkthrough(input: DeskWalkthroughGateInput): boolean {
  const { helpStateReady, tourState, profileCreatedAt, pathname, isDesktop } = input;
  if (!helpStateReady) return false;
  if (tourResolved(tourState)) return false;
  const created = createdAtMs(profileCreatedAt);
  if (created === null) return false;
  if (created >= Date.parse(DESK_WALKTHROUGH_SHIP_DATE)) return false; // new → auto-modal path
  if (pathname !== '/desk') return false;
  if (!isDesktop) return false;
  return true;
}

/**
 * TRUE iff a `location.search` string carries `?tour=desk-walkthrough` — the
 * replay entry dispatched by the ⌘K "Take the walkthrough" row and the pinned
 * `/help` replay row. Pure so it's testable without a router.
 */
export function hasDeskWalkthroughReplayParam(search: string): boolean {
  if (!search) return false;
  const query = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  return params.get(DESK_WALKTHROUGH_REPLAY_PARAM) === DESK_WALKTHROUGH_TOUR_ID;
}
