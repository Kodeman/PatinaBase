import { describe, it, expect } from 'vitest';
import {
  ACH_SURCHARGE_BPS,
  ACH_SURCHARGE_CAP_CENTS,
  DEFAULT_CARD_SURCHARGE_BPS,
  achSurchargeCents,
  cardSurchargeCents,
  onlineSurchargeCents,
  invoicePaymentMethodLabel,
} from './index';

// ─────────────────────────────────────────────────────────────────────────────
// achSurchargeCents — 0.8% capped at $5 (ACH_SURCHARGE_CAP_CENTS)
// ─────────────────────────────────────────────────────────────────────────────

describe('achSurchargeCents', () => {
  it('sanity: constants match the invariant (invariant #2, migration 00428)', () => {
    expect(ACH_SURCHARGE_BPS).toBe(80);
    expect(ACH_SURCHARGE_CAP_CENTS).toBe(500);
  });

  it('cap boundary: $625.00 (62500 cents) formula lands exactly on the $5 cap', () => {
    // ((62500 * 80) + 5000) / 10000 = 500.5 → floor = 500 — the natural
    // formula value equals the cap here, not clamped.
    expect(achSurchargeCents(62_500)).toBe(500);
  });

  it('above the cap boundary: the natural formula exceeds $5 and gets clamped', () => {
    // ((62563 * 80) + 5000) / 10000 = 501.004 → floor = 501, capped to 500.
    expect(achSurchargeCents(62_563)).toBe(500);
    // ((70000 * 80) + 5000) / 10000 = 560.5 → floor = 560, capped to 500.
    expect(achSurchargeCents(70_000)).toBe(500);
  });

  it('below the cap, returns the uncapped formula value', () => {
    // ((1000 * 80) + 5000) / 10000 = 8.5 → floor = 8.
    expect(achSurchargeCents(1_000)).toBe(8);
  });

  it('zero and negative amounts surcharge to zero', () => {
    expect(achSurchargeCents(0)).toBe(0);
    expect(achSurchargeCents(-1)).toBe(0);
    expect(achSurchargeCents(-100_000)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cardSurchargeCents — studio bps, default 300 (3%)
// ─────────────────────────────────────────────────────────────────────────────

describe('cardSurchargeCents', () => {
  it('half-cent half-up boundary: an exact .5-cent fraction rounds UP', () => {
    // 20 cents * 250 bps = 5000 → ((5000 + 5000) / 10000) = 1.0 exactly, i.e.
    // the pre-rounding value is precisely 0.5 cents and the formula rounds it
    // up to 1, not down to 0.
    expect(cardSurchargeCents(20, 250)).toBe(1);
  });

  it('uses DEFAULT_CARD_SURCHARGE_BPS (300) when no bps is passed', () => {
    expect(DEFAULT_CARD_SURCHARGE_BPS).toBe(300);
    // ((10000 * 300) + 5000) / 10000 = 300.5 → floor = 300.
    expect(cardSurchargeCents(10_000)).toBe(300);
    expect(cardSurchargeCents(10_000, 300)).toBe(300);
    expect(cardSurchargeCents(10_000)).toBe(cardSurchargeCents(10_000, DEFAULT_CARD_SURCHARGE_BPS));
  });

  it('bps 0 surcharges to zero regardless of amount', () => {
    expect(cardSurchargeCents(1_000_000, 0)).toBe(0);
  });

  it('zero and negative amounts surcharge to zero', () => {
    expect(cardSurchargeCents(0, 300)).toBe(0);
    expect(cardSurchargeCents(-500, 300)).toBe(0);
  });

  it('has no cap (unlike ACH) — a large invoice at max bps surcharges past $5', () => {
    // ((100000 * 300) + 5000) / 10000 = 3000.5 → floor = 3000 (=$30.00).
    expect(cardSurchargeCents(100_000, 300)).toBe(3_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// onlineSurchargeCents — dispatch by method
// ─────────────────────────────────────────────────────────────────────────────

describe('onlineSurchargeCents', () => {
  it('dispatches us_bank_account to the ACH formula (capped)', () => {
    expect(onlineSurchargeCents('us_bank_account', 70_000)).toBe(achSurchargeCents(70_000));
    expect(onlineSurchargeCents('us_bank_account', 70_000)).toBe(500);
  });

  it('dispatches card to the card formula at the given bps', () => {
    expect(onlineSurchargeCents('card', 10_000, 250)).toBe(cardSurchargeCents(10_000, 250));
  });

  it('card defaults to DEFAULT_CARD_SURCHARGE_BPS when no bps is passed', () => {
    expect(onlineSurchargeCents('card', 10_000)).toBe(cardSurchargeCents(10_000));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// invoicePaymentMethodLabel — label matrix
// ─────────────────────────────────────────────────────────────────────────────

describe('invoicePaymentMethodLabel', () => {
  it('stripe + card -> "Card"', () => {
    expect(
      invoicePaymentMethodLabel({ method: 'stripe', stripe_payment_method_type: 'card' })
    ).toBe('Card');
  });

  it('stripe + us_bank_account -> "Bank transfer (ACH)"', () => {
    expect(
      invoicePaymentMethodLabel({
        method: 'stripe',
        stripe_payment_method_type: 'us_bank_account',
      })
    ).toBe('Bank transfer (ACH)');
  });

  it('stripe + null (or absent) -> legacy "Card (Stripe)"', () => {
    expect(
      invoicePaymentMethodLabel({ method: 'stripe', stripe_payment_method_type: null })
    ).toBe('Card (Stripe)');
    expect(invoicePaymentMethodLabel({ method: 'stripe' })).toBe('Card (Stripe)');
  });

  it('non-stripe methods pass through to the existing labels untouched', () => {
    expect(invoicePaymentMethodLabel({ method: 'check' })).toBe('Check');
    expect(invoicePaymentMethodLabel({ method: 'wire' })).toBe('Wire transfer');
    expect(invoicePaymentMethodLabel({ method: 'ach_manual' })).toBe('ACH (manual)');
    expect(invoicePaymentMethodLabel({ method: 'cash' })).toBe('Cash');
    expect(invoicePaymentMethodLabel({ method: 'other' })).toBe('Other');
  });

  it('non-stripe methods ignore a stray stripe_payment_method_type', () => {
    expect(
      invoicePaymentMethodLabel({ method: 'check', stripe_payment_method_type: 'card' })
    ).toBe('Check');
  });
});
