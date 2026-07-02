/**
 * Amendment derivation contract (Track 7 · R81) — the impact math and status
 * vocabulary behind the Amendment sheet, ported from the legacy
 * scope-change-form/detail pair.
 */

import {
  amendmentImpactLine,
  amendmentStatusWord,
  computeAmendmentTotals,
  isAmendmentOpen,
  roomToStoredShape,
} from '../amendment-derivation';

describe('computeAmendmentTotals', () => {
  it('adds both impacts to the current contract total (the legacy math)', () => {
    const { currentCents, newTotalCents } = computeAmendmentTotals(
      { total_amount_cents: 1_000_000 },
      { additionalFfeCents: 250_000, additionalFeeCents: 50_000, timelineWeeks: 2 },
    );
    expect(currentCents).toBe(1_000_000);
    expect(newTotalCents).toBe(1_300_000);
  });

  it('falls back total_amount_cents → budget_cents → 0 (post-00139 convention)', () => {
    expect(
      computeAmendmentTotals(
        { total_amount_cents: null, budget_cents: 400_000 },
        { additionalFfeCents: 0, additionalFeeCents: 0, timelineWeeks: 0 },
      ).currentCents,
    ).toBe(400_000);
    expect(
      computeAmendmentTotals(null, {
        additionalFfeCents: 100,
        additionalFeeCents: 0,
        timelineWeeks: 0,
      }).newTotalCents,
    ).toBe(100);
  });
});

describe('amendmentStatusWord', () => {
  it('speaks the scope_change_requests vocabulary honestly', () => {
    expect(amendmentStatusWord({ status: 'draft' })).toBe('Draft');
    expect(amendmentStatusWord({ status: 'sent' })).toBe('With the client');
    expect(amendmentStatusWord({ status: 'viewed' })).toBe('With the client');
    expect(amendmentStatusWord({ status: 'declined' })).toBe('Declined');
    expect(amendmentStatusWord({ status: 'cancelled' })).toBe('Cancelled');
  });

  it('splits approved by applied_at — the apply act is the difference', () => {
    expect(amendmentStatusWord({ status: 'approved', applied_at: null })).toBe('Approved');
    expect(amendmentStatusWord({ status: 'approved', applied_at: '2026-07-01' })).toBe('Applied');
  });
});

describe('isAmendmentOpen', () => {
  it('open while drafted, out, or approved-unapplied; settled once applied', () => {
    expect(isAmendmentOpen({ status: 'draft' })).toBe(true);
    expect(isAmendmentOpen({ status: 'sent' })).toBe(true);
    expect(isAmendmentOpen({ status: 'approved', applied_at: null })).toBe(true);
    expect(isAmendmentOpen({ status: 'approved', applied_at: '2026-07-01' })).toBe(false);
    expect(isAmendmentOpen({ status: 'declined' })).toBe(false);
    expect(isAmendmentOpen({ status: 'cancelled' })).toBe(false);
  });
});

describe('amendmentImpactLine', () => {
  it('reads money and weeks together', () => {
    expect(
      amendmentImpactLine({
        additional_ffe_budget_cents: 250_000,
        additional_design_fee_cents: 170_000,
        timeline_impact_weeks: 2,
      }),
    ).toBe('+$4,200 · +2 weeks');
  });

  it('reads a single week singular and omits zero parts', () => {
    expect(
      amendmentImpactLine({ additional_ffe_budget_cents: 0, timeline_impact_weeks: 1 }),
    ).toBe('+1 week');
    expect(amendmentImpactLine({ additional_ffe_budget_cents: 100_000 })).toBe('+$1,000');
  });

  it('admits when there is no impact', () => {
    expect(amendmentImpactLine({})).toBe('No fee or timeline impact');
  });
});

describe('roomToStoredShape', () => {
  it('stores snake_case so apply_scope_change (00084) applies rooms 1:1', () => {
    expect(roomToStoredShape({ name: 'Entryway', budgetCents: 120_000 })).toEqual({
      name: 'Entryway',
      room_type: null,
      budget_cents: 120_000,
      ffe_categories: [],
    });
  });
});
