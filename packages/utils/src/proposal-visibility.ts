/**
 * Proposal client-visibility tiers (R86 — "the portal copy is canonical").
 *
 * A proposal's `client_visibility_tier` (00141: 'full' | 'milestone' | 'curated')
 * governs WHAT the client's copy renders. R86 makes that the ONE law for both
 * surfaces that show the copy:
 *
 *   • the client portal's proposal document (what the client actually sees), and
 *   • the Drafting-Room mirror ("Sarah's copy" — the designer's live preview).
 *
 * Both import `proposalTierVisibility` from here, so preview IS truth: the two
 * renders cannot drift. This is a pure, dependency-free module on purpose — it
 * is the single source the R86 contract test pins.
 *
 * The money-bearing blocks (`lineItems`, `roomBudgets`) mirror the shipped
 * `isClientHidden('cost', tier)` helper (client-view-toggle.tsx): shown at
 * 'full', hidden at 'milestone'/'curated'. The remaining rows are the R86
 * refinement that gives the three tiers distinct, monotonically-narrowing
 * renders — each narrower tier hides strictly more.
 */

export type ClientVisibilityTier = 'full' | 'milestone' | 'curated';

export interface ProposalTierVisibility {
  /** Itemized per-line SELL amounts (the LineItemsBlock table with prices). */
  lineItems: boolean;
  /** Per-room budget figures (the ScopeRoomsBlock currency column). */
  roomBudgets: boolean;
  /** The milestone payment schedule (amounts + percentages). */
  paymentSchedule: boolean;
  /** The project timeline phases. */
  timeline: boolean;
  /** The scope exclusions ("not included"). */
  exclusions: boolean;
  /** The scope room list — names + room types only, never money. */
  scopeRooms: boolean;
  /** The single rolled-up investment total (the number the client agrees to). */
  investmentTotal: boolean;
}

const FULL: ProposalTierVisibility = {
  lineItems: true,
  roomBudgets: true,
  paymentSchedule: true,
  timeline: true,
  exclusions: true,
  scopeRooms: true,
  investmentTotal: true,
};

const MILESTONE: ProposalTierVisibility = {
  // No itemization or per-room budgets — the client sees the shape, the
  // milestone schedule, and the one total.
  lineItems: false,
  roomBudgets: false,
  paymentSchedule: true,
  timeline: true,
  exclusions: true,
  scopeRooms: true,
  investmentTotal: true,
};

const CURATED: ProposalTierVisibility = {
  // The most private tier: only the scope shape (rooms, timeline, exclusions)
  // and the one total. No itemization, no per-room budgets, no payment breakdown.
  lineItems: false,
  roomBudgets: false,
  paymentSchedule: false,
  timeline: true,
  exclusions: true,
  scopeRooms: true,
  investmentTotal: true,
};

/**
 * The canonical per-tier block visibility for a proposal's client copy (R86).
 * A null/unknown tier falls back to 'milestone' — the DB default (00141).
 */
export function proposalTierVisibility(
  tier: ClientVisibilityTier | null | undefined,
): ProposalTierVisibility {
  switch (tier) {
    case 'full':
      return FULL;
    case 'curated':
      return CURATED;
    case 'milestone':
    default:
      return MILESTONE;
  }
}
