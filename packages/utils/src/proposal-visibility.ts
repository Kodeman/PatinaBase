/**
 * Proposal client-visibility law (R86 — "the portal copy is canonical").
 *
 * A proposal's `client_visibility_tier` (00141: 'full' | 'milestone' | 'curated')
 * governs WHAT the client's copy renders. R86 makes that the ONE law for both
 * surfaces that show the copy:
 *
 *   • the client portal's proposal document (what the client actually sees), and
 *   • the Drafting-Room mirror ("Sarah's copy" — the designer's live preview).
 *
 * Both import from here, so preview IS truth: the two renders cannot drift. This
 * is a pure, dependency-free module on purpose — it is the single source the R86
 * contract test pins.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Wave 2 · Track C (Schedule & Boards, 2026-07-07): the law grows FIELDS.
 *
 * The three tiers are no longer opaque block-booleans — each tier is now a NAMED
 * PRESET over a per-field `ShareVisibility` record. This lets a share link (C2)
 * turn a single field (say `supplierIdentity`) off independently of `pricing`,
 * which the old block model could not express — and it fixes the supplier/brand
 * bundling defect where vendor identity rode along with `lineItems` at every
 * tier (proposal-document.tsx:443).
 *
 * The legacy block-boolean API (`ProposalTierVisibility` / `proposalTierVisibility`)
 * stays exported and is now DERIVED from the same preset table, so every existing
 * caller is byte-for-byte unchanged until it opts into the fielded law.
 */

export type ClientVisibilityTier = 'full' | 'milestone' | 'curated';

// ─────────────────────────────────────────────────────────────────────────────
// The fielded law — ShareVisibility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The per-field visibility record. Every surface that renders the proposal copy
 * (the client document, the designer mirror, and a guest share) reads these
 * booleans. A tier preset produces one of these; a share link stores its own.
 */
export interface ShareVisibility {
  /** Money: per-line SELL amounts and priced itemization. */
  pricing: boolean;
  /** Per-room budget figures (the ScopeRoomsBlock currency column). */
  roomBudgets: boolean;
  /** The milestone payment schedule (amounts + percentages). */
  paymentSchedule: boolean;
  /**
   * Supplier / brand identity on each line (vendor_name || product.brand).
   * INDEPENDENT of `pricing` — a studio can show the piece and its price while
   * protecting its sourcing, or vice-versa. Fixes the 443-445 bundling defect.
   */
  supplierIdentity: boolean;
  /** Outbound product / source URLs on a line. */
  sourceUrls: boolean;
  /**
   * The itemized piece list itself (names, images, quantities) — the "what",
   * distinct from `pricing` (the "how much"). When false, the client sees only
   * the scope shape and the rolled-up total.
   */
  itemDetails: boolean;
  /** Per-line lead-time buckets (the Wave-1 schedule facet). */
  leadTimes: boolean;
  /**
   * Whether the per-line client verdict loop (C3) is offered on this render.
   * ALWAYS forced false on a guest (tokenized) share — verdicts require the
   * authed client account. For the authed client's own copy, the live gate is
   * `proposals.feedback_enabled` (00267); this preset field is the share-matrix
   * default and the guest kill-switch.
   */
  feedbackEnabled: boolean;
}

/** Stable field order — for the share-matrix editor and property tests. */
export const SHARE_VISIBILITY_KEYS: (keyof ShareVisibility)[] = [
  'pricing',
  'roomBudgets',
  'paymentSchedule',
  'supplierIdentity',
  'sourceUrls',
  'itemDetails',
  'leadTimes',
  'feedbackEnabled',
];

/** Human labels + one-line descriptions for the share-matrix editor UI. */
export const SHARE_VISIBILITY_FIELDS: {
  key: keyof ShareVisibility;
  label: string;
  description: string;
}[] = [
  { key: 'itemDetails', label: 'Item list', description: 'The pieces themselves — names, images, quantities.' },
  { key: 'pricing', label: 'Pricing', description: 'Per-line prices and the itemized cost breakdown.' },
  { key: 'supplierIdentity', label: 'Supplier', description: 'Vendor and brand names on each line.' },
  { key: 'sourceUrls', label: 'Source links', description: 'Outbound product / source URLs.' },
  { key: 'leadTimes', label: 'Lead times', description: 'Per-line delivery lead-time estimates.' },
  { key: 'roomBudgets', label: 'Room budgets', description: 'Per-room budget figures.' },
  { key: 'paymentSchedule', label: 'Payment schedule', description: 'The milestone payment breakdown.' },
  { key: 'feedbackEnabled', label: 'Feedback', description: 'Let the client approve or flag lines (authed accounts only).' },
];

/**
 * The ONE table. Each tier is a preset over ShareVisibility. Read top-to-bottom
 * the tiers narrow monotonically — a narrower tier never turns a field back ON.
 *
 *   full      — everything (the itemized, priced, sourced document).
 *   milestone — the shape + the schedule + the total; no money, no sourcing.
 *   curated   — the most private: only scope shape and the one total.
 *
 * `timeline`, `exclusions`, `scopeRooms`, and `investmentTotal` are structural
 * (the scope shape + the one number the client agrees to) and survive every tier
 * — they live only in the derived block API below, not as toggleable share fields.
 */
const SHARE_PRESETS: Record<ClientVisibilityTier, ShareVisibility> = {
  full: {
    pricing: true,
    roomBudgets: true,
    paymentSchedule: true,
    supplierIdentity: true,
    sourceUrls: true,
    itemDetails: true,
    leadTimes: true,
    feedbackEnabled: true,
  },
  milestone: {
    // The client sees WHAT is proposed and the delivery shape, but not the
    // money or the sourcing — the studio's commercial detail stays private.
    pricing: false,
    roomBudgets: false,
    paymentSchedule: true,
    supplierIdentity: false,
    sourceUrls: false,
    itemDetails: true,
    leadTimes: true,
    feedbackEnabled: true,
  },
  curated: {
    // The most private tier: only the scope shape (rooms, timeline, exclusions)
    // and the one total. No item list, no money, no schedule.
    pricing: false,
    roomBudgets: false,
    paymentSchedule: false,
    supplierIdentity: false,
    sourceUrls: false,
    itemDetails: false,
    leadTimes: false,
    feedbackEnabled: true,
  },
};

/**
 * The canonical ShareVisibility for a proposal's tier. A null/unknown tier falls
 * back to 'milestone' — the DB default (00141).
 */
export function shareVisibilityForTier(
  tier: ClientVisibilityTier | null | undefined,
): ShareVisibility {
  switch (tier) {
    case 'full':
      return { ...SHARE_PRESETS.full };
    case 'curated':
      return { ...SHARE_PRESETS.curated };
    case 'milestone':
    default:
      return { ...SHARE_PRESETS.milestone };
  }
}

/**
 * Coerce a possibly-partial / untrusted record (e.g. a `document_shares.visibility`
 * jsonb blob read back from the DB) into a full ShareVisibility. Missing or
 * non-boolean fields fail CLOSED (default false) — a malformed share can only
 * ever reveal LESS, never more.
 */
export function normalizeShareVisibility(input: unknown): ShareVisibility {
  const src = (input ?? {}) as Record<string, unknown>;
  const out = {} as ShareVisibility;
  for (const key of SHARE_VISIBILITY_KEYS) {
    out[key] = src[key] === true;
  }
  return out;
}

/**
 * The visibility a GUEST (tokenized, unauthenticated) share is rendered under:
 * whatever the share stored, but with `feedbackEnabled` forced false. Verdicts
 * require the authed client account; a link is view-only (the Schedule & Boards
 * plan, 2026-07-07).
 */
export function guestShareVisibility(v: ShareVisibility): ShareVisibility {
  return { ...v, feedbackEnabled: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy block API — DERIVED from the preset table (unchanged output)
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Derive the legacy block-boolean gate from a ShareVisibility. `lineItems` (the
 * priced itemization) requires BOTH the item list and pricing; the structural
 * blocks are always on. This reproduces the pre-Wave-2 table exactly, so the
 * R86 contract test and every existing caller stay green.
 */
function blockVisibility(v: ShareVisibility): ProposalTierVisibility {
  return {
    lineItems: v.pricing && v.itemDetails,
    roomBudgets: v.roomBudgets,
    paymentSchedule: v.paymentSchedule,
    timeline: true,
    exclusions: true,
    scopeRooms: true,
    investmentTotal: true,
  };
}

/**
 * The canonical per-tier block visibility for a proposal's client copy (R86).
 * A null/unknown tier falls back to 'milestone' — the DB default (00141).
 */
export function proposalTierVisibility(
  tier: ClientVisibilityTier | null | undefined,
): ProposalTierVisibility {
  return blockVisibility(shareVisibilityForTier(tier));
}

/** Derive the legacy block gate from any ShareVisibility (e.g. a share's own). */
export function blockVisibilityFromShare(v: ShareVisibility): ProposalTierVisibility {
  return blockVisibility(v);
}
