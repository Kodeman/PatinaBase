/**
 * R86 tier-gating contract — the one law both proposal-copy renders obey.
 *
 * `proposalTierVisibility` is imported by BOTH the client portal's proposal
 * document and the designer Drafting-Room mirror. This suite pins the exact
 * per-tier block visibility so the two surfaces provably cannot drift, and so a
 * future edit that widens what a narrower tier reveals fails CI here.
 */

import {
  proposalTierVisibility,
  type ProposalTierVisibility,
  shareVisibilityForTier,
  blockVisibilityFromShare,
  normalizeShareVisibility,
  guestShareVisibility,
  SHARE_VISIBILITY_KEYS,
  type ShareVisibility,
  type ClientVisibilityTier,
} from './proposal-visibility';

const KEYS: (keyof ProposalTierVisibility)[] = [
  'lineItems',
  'roomBudgets',
  'paymentSchedule',
  'timeline',
  'exclusions',
  'scopeRooms',
  'investmentTotal',
];

describe('proposalTierVisibility (R86 tier-gating contract)', () => {
  it('full — the client sees everything: itemized lines, per-room budgets, the schedule', () => {
    expect(proposalTierVisibility('full')).toEqual<ProposalTierVisibility>({
      lineItems: true,
      roomBudgets: true,
      paymentSchedule: true,
      timeline: true,
      exclusions: true,
      scopeRooms: true,
      investmentTotal: true,
    });
  });

  it('milestone — hides itemized lines + per-room budgets; keeps the payment schedule', () => {
    expect(proposalTierVisibility('milestone')).toEqual<ProposalTierVisibility>({
      lineItems: false,
      roomBudgets: false,
      paymentSchedule: true,
      timeline: true,
      exclusions: true,
      scopeRooms: true,
      investmentTotal: true,
    });
  });

  it('curated — hides itemized lines, per-room budgets, AND the payment breakdown', () => {
    expect(proposalTierVisibility('curated')).toEqual<ProposalTierVisibility>({
      lineItems: false,
      roomBudgets: false,
      paymentSchedule: false,
      timeline: true,
      exclusions: true,
      scopeRooms: true,
      investmentTotal: true,
    });
  });

  it('null / undefined fall back to milestone (the DB default, 00141)', () => {
    expect(proposalTierVisibility(null)).toEqual(proposalTierVisibility('milestone'));
    expect(proposalTierVisibility(undefined)).toEqual(proposalTierVisibility('milestone'));
  });

  it('every tier always shows the one rolled-up investment total', () => {
    for (const tier of ['full', 'milestone', 'curated'] as const) {
      expect(proposalTierVisibility(tier).investmentTotal).toBe(true);
    }
  });

  it('scope shape (rooms · timeline · exclusions) survives every tier', () => {
    for (const tier of ['full', 'milestone', 'curated'] as const) {
      const v = proposalTierVisibility(tier);
      expect(v.scopeRooms).toBe(true);
      expect(v.timeline).toBe(true);
      expect(v.exclusions).toBe(true);
    }
  });

  it('is monotonic — each narrower tier hides strictly more (never reveals more)', () => {
    const full = proposalTierVisibility('full');
    const milestone = proposalTierVisibility('milestone');
    const curated = proposalTierVisibility('curated');
    // For every gate, full ⊇ milestone ⊇ curated (true implies true down the chain
    // is NOT required, but a narrower tier must never turn a hidden field ON).
    for (const k of KEYS) {
      if (!full[k]) expect(milestone[k]).toBe(false);
      if (!milestone[k]) expect(curated[k]).toBe(false);
    }
    // And at least one gate actually tightens at each step (the tiers differ).
    expect(KEYS.some((k) => full[k] && !milestone[k])).toBe(true);
    expect(KEYS.some((k) => milestone[k] && !curated[k])).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wave 2 · C1 — the fielded ShareVisibility law
// ─────────────────────────────────────────────────────────────────────────────

const TIERS: ClientVisibilityTier[] = ['full', 'milestone', 'curated'];

describe('shareVisibilityForTier (C1 preset table)', () => {
  it('full — everything is shown', () => {
    expect(shareVisibilityForTier('full')).toEqual<ShareVisibility>({
      pricing: true,
      roomBudgets: true,
      paymentSchedule: true,
      supplierIdentity: true,
      sourceUrls: true,
      itemDetails: true,
      leadTimes: true,
      feedbackEnabled: true,
    });
  });

  it('milestone — the item list + schedule + lead times, but no money and no sourcing', () => {
    expect(shareVisibilityForTier('milestone')).toEqual<ShareVisibility>({
      pricing: false,
      roomBudgets: false,
      paymentSchedule: true,
      supplierIdentity: false,
      sourceUrls: false,
      itemDetails: true,
      leadTimes: true,
      feedbackEnabled: true,
    });
  });

  it('curated — only the scope shape and the one total: no list, no money, no schedule', () => {
    expect(shareVisibilityForTier('curated')).toEqual<ShareVisibility>({
      pricing: false,
      roomBudgets: false,
      paymentSchedule: false,
      supplierIdentity: false,
      sourceUrls: false,
      itemDetails: false,
      leadTimes: false,
      feedbackEnabled: true,
    });
  });

  it('null / undefined fall back to milestone (the DB default, 00141)', () => {
    expect(shareVisibilityForTier(null)).toEqual(shareVisibilityForTier('milestone'));
    expect(shareVisibilityForTier(undefined)).toEqual(shareVisibilityForTier('milestone'));
  });

  it('is monotonic — each narrower tier never turns a field back ON', () => {
    const full = shareVisibilityForTier('full');
    const milestone = shareVisibilityForTier('milestone');
    const curated = shareVisibilityForTier('curated');
    for (const k of SHARE_VISIBILITY_KEYS) {
      if (!full[k]) expect(milestone[k]).toBe(false);
      if (!milestone[k]) expect(curated[k]).toBe(false);
    }
    // Each step tightens at least one field.
    expect(SHARE_VISIBILITY_KEYS.some((k) => full[k] && !milestone[k])).toBe(true);
    expect(SHARE_VISIBILITY_KEYS.some((k) => milestone[k] && !curated[k])).toBe(true);
  });

  it('supplierIdentity is independent of pricing (the 443-445 fix)', () => {
    // The preset table already decouples them (milestone: itemDetails on, both
    // pricing and supplier off), and a custom share can hold any combination.
    const custom = normalizeShareVisibility({
      itemDetails: true,
      pricing: true,
      supplierIdentity: false, // show the priced piece, hide the sourcing
    });
    expect(custom.pricing).toBe(true);
    expect(custom.supplierIdentity).toBe(false);
    const inverse = normalizeShareVisibility({
      itemDetails: true,
      pricing: false,
      supplierIdentity: true, // show the brand, hide the price
    });
    expect(inverse.pricing).toBe(false);
    expect(inverse.supplierIdentity).toBe(true);
  });
});

describe('blockVisibilityFromShare — the legacy block API derives from the preset table', () => {
  it('reproduces proposalTierVisibility exactly for every tier (zero drift)', () => {
    for (const tier of TIERS) {
      expect(blockVisibilityFromShare(shareVisibilityForTier(tier))).toEqual(
        proposalTierVisibility(tier),
      );
    }
  });

  it('lineItems requires BOTH pricing and itemDetails', () => {
    expect(blockVisibilityFromShare(normalizeShareVisibility({ pricing: true, itemDetails: true })).lineItems).toBe(true);
    expect(blockVisibilityFromShare(normalizeShareVisibility({ pricing: true, itemDetails: false })).lineItems).toBe(false);
    expect(blockVisibilityFromShare(normalizeShareVisibility({ pricing: false, itemDetails: true })).lineItems).toBe(false);
  });

  it('structural blocks (timeline/exclusions/scopeRooms/investmentTotal) are always on', () => {
    const v = blockVisibilityFromShare(shareVisibilityForTier('curated'));
    expect(v.timeline).toBe(true);
    expect(v.exclusions).toBe(true);
    expect(v.scopeRooms).toBe(true);
    expect(v.investmentTotal).toBe(true);
  });
});

describe('normalizeShareVisibility — fail closed', () => {
  it('coerces missing / non-boolean fields to false', () => {
    expect(normalizeShareVisibility({})).toEqual<ShareVisibility>({
      pricing: false,
      roomBudgets: false,
      paymentSchedule: false,
      supplierIdentity: false,
      sourceUrls: false,
      itemDetails: false,
      leadTimes: false,
      feedbackEnabled: false,
    });
    expect(normalizeShareVisibility(null)).toEqual(normalizeShareVisibility({}));
    expect(normalizeShareVisibility(undefined)).toEqual(normalizeShareVisibility({}));
    // "truthy" non-true values do NOT open a field.
    expect(normalizeShareVisibility({ pricing: 'yes', roomBudgets: 1 })).toEqual(normalizeShareVisibility({}));
  });

  it('round-trips a full record', () => {
    const full = shareVisibilityForTier('full');
    expect(normalizeShareVisibility(full)).toEqual(full);
  });
});

describe('guestShareVisibility — a link is view-only', () => {
  it('forces feedbackEnabled false regardless of the stored value', () => {
    for (const tier of TIERS) {
      expect(guestShareVisibility(shareVisibilityForTier(tier)).feedbackEnabled).toBe(false);
    }
    expect(guestShareVisibility(normalizeShareVisibility({ feedbackEnabled: true })).feedbackEnabled).toBe(false);
  });

  it('leaves every other field untouched', () => {
    const v = shareVisibilityForTier('full');
    const guest = guestShareVisibility(v);
    for (const k of SHARE_VISIBILITY_KEYS) {
      if (k === 'feedbackEnabled') continue;
      expect(guest[k]).toBe(v[k]);
    }
  });
});
