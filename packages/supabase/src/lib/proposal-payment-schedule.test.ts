import { describe, expect, it } from 'vitest';
import {
  assessProposalPaymentSchedule,
  canonicalizeProposalPaymentSchedule,
} from './proposal-payment-schedule';

describe('canonical proposal payment schedule', () => {
  it('derives every client amount from the current proposal total', () => {
    const canonical = canonicalizeProposalPaymentSchedule(
      [
        {
          id: 'deposit',
          label: 'Project deposit',
          percentage: 100,
          amount_cents: 320_000,
        },
      ],
      1_320_000,
    );

    expect(canonical).toEqual([
      {
        id: 'deposit',
        label: 'Project deposit',
        percentage: 100,
        amount_cents: 1_320_000,
      },
    ]);
  });

  it('blocks the exact zero-dollar schedule that reached the client walkthrough', () => {
    const result = assessProposalPaymentSchedule(
      [
        {
          id: 'milestone-1',
          label: 'New Milestone',
          percentage: 0,
          amount_cents: 0,
        },
      ],
      1_320_000,
    );

    expect(result.safeToSend).toBe(false);
    expect(result.percentageTotal).toBe(0);
    expect(result.amountTotal).toBe(0);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'allocation_not_100' }),
        expect.objectContaining({ code: 'non_positive_milestone' }),
      ]),
    );
  });

  it('balances rounding so a valid 100% schedule exactly matches the signed total', () => {
    const result = assessProposalPaymentSchedule(
      [
        { id: 'one', label: 'One', percentage: 33, amount_cents: 0 },
        { id: 'two', label: 'Two', percentage: 33, amount_cents: 0 },
        { id: 'three', label: 'Three', percentage: 34, amount_cents: 0 },
      ],
      10_001,
    );

    expect(result.safeToSend).toBe(true);
    expect(result.amountTotal).toBe(10_001);
    expect(
      result.milestones.map((milestone) => milestone.amount_cents),
    ).toEqual([3_300, 3_300, 3_401]);
  });

  it('accepts decimal allocations that total 100 within numeric precision', () => {
    const result = assessProposalPaymentSchedule(
      [
        { id: 'one', label: 'One', percentage: 33.33, amount_cents: 0 },
        { id: 'two', label: 'Two', percentage: 33.33, amount_cents: 0 },
        { id: 'three', label: 'Three', percentage: 33.34, amount_cents: 0 },
      ],
      1_000_000,
    );

    expect(result.safeToSend).toBe(true);
    expect(result.amountTotal).toBe(1_000_000);
  });
});
