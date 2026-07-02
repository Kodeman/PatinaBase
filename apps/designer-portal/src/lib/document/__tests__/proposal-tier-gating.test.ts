/**
 * R86 tier-gating contract — "the portal copy is canonical, tier-governed."
 *
 * Two lines held here:
 *   1. `proposalTierVisibility` (@patina/utils) — the exact per-tier block
 *      visibility (WHICH blocks render at full vs milestone vs curated). This
 *      is the one law both proposal-copy renders obey.
 *   2. Anti-drift (preview = truth): BOTH surfaces that render the copy — the
 *      designer Drafting-Room mirror AND the client portal's proposal document
 *      — import that one law at the source level. If a future edit renders the
 *      client copy without consulting the gate, this fails.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { proposalTierVisibility } from '@patina/utils';

describe('proposalTierVisibility (R86 — which blocks render per tier)', () => {
  it('full — itemized lines + per-room budgets + payment schedule all render', () => {
    const v = proposalTierVisibility('full');
    expect(v.lineItems).toBe(true);
    expect(v.roomBudgets).toBe(true);
    expect(v.paymentSchedule).toBe(true);
  });

  it('milestone — HIDES itemized lines + per-room budgets; KEEPS the payment schedule', () => {
    const v = proposalTierVisibility('milestone');
    expect(v.lineItems).toBe(false);
    expect(v.roomBudgets).toBe(false);
    expect(v.paymentSchedule).toBe(true);
  });

  it('curated — HIDES itemized lines, per-room budgets, AND the payment schedule', () => {
    const v = proposalTierVisibility('curated');
    expect(v.lineItems).toBe(false);
    expect(v.roomBudgets).toBe(false);
    expect(v.paymentSchedule).toBe(false);
  });

  it('timeline · exclusions · scope rooms · the one total survive every tier', () => {
    for (const tier of ['full', 'milestone', 'curated'] as const) {
      const v = proposalTierVisibility(tier);
      expect(v.timeline).toBe(true);
      expect(v.exclusions).toBe(true);
      expect(v.scopeRooms).toBe(true);
      expect(v.investmentTotal).toBe(true);
    }
  });

  it('null/undefined tier falls back to milestone (the DB default)', () => {
    expect(proposalTierVisibility(null)).toEqual(proposalTierVisibility('milestone'));
  });
});

describe('R86 anti-drift — both copy renders obey the ONE shared law', () => {
  const mirrorSource = readFileSync(
    join(__dirname, '..', '..', '..', 'components', 'document', 'drafting', 'proposal-mirror.tsx'),
    'utf8',
  );
  // apps/designer-portal/src/lib/document/__tests__ → apps/client-portal/src/components
  const clientDocSource = readFileSync(
    join(
      __dirname,
      '..', '..', '..', '..', '..',
      'client-portal', 'src', 'components', 'proposal-document.tsx',
    ),
    'utf8',
  );

  it('the Drafting-Room mirror imports proposalTierVisibility', () => {
    expect(mirrorSource).toMatch(/proposalTierVisibility/);
    expect(mirrorSource).toMatch(/@patina\/utils/);
  });

  it("the client portal's proposal document imports proposalTierVisibility", () => {
    expect(clientDocSource).toMatch(/proposalTierVisibility/);
    expect(clientDocSource).toMatch(/@patina\/utils/);
  });

  it('the client render gates its money blocks on the tier (lineItems / roomBudgets / paymentSchedule)', () => {
    expect(clientDocSource).toMatch(/gate\.lineItems/);
    expect(clientDocSource).toMatch(/gate\.roomBudgets/);
    expect(clientDocSource).toMatch(/gate\.paymentSchedule/);
  });
});
