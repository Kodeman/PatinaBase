/**
 * R86 tier-gating contract — the one law both proposal-copy renders obey.
 *
 * `proposalTierVisibility` is imported by BOTH the client portal's proposal
 * document and the designer Drafting-Room mirror. This suite pins the exact
 * per-tier block visibility so the two surfaces provably cannot drift, and so a
 * future edit that widens what a narrower tier reveals fails CI here.
 */

import { proposalTierVisibility, type ProposalTierVisibility } from './proposal-visibility';

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
