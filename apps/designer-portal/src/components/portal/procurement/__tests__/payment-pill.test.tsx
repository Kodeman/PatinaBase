/**
 * Item 4 — truthful "Refunded" display state.
 *
 * `po_payments.state` gained `'refunded'` (migration 00277, charge.refunded
 * webhook on a full refund) but the pill's original state map only knew
 * pending/due/paid/patina_handled — a refunded payment rendered as
 * `undefined` styles (blank/misleading pill) rather than a real "Refunded"
 * state. No @patina/supabase dependency here — PaymentPill is a pure
 * presentational component, so this is a plain RTL render, no mocking.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { PaymentPill } from '../payment-pill';

describe('PaymentPill — refunded state', () => {
  it('renders a truthful "Refunded" label in short form (no kind supplied)', () => {
    render(<PaymentPill state="refunded" />);
    expect(screen.getByText('Refunded')).toBeInTheDocument();
  });

  it('renders the long form with a "refunded" verb, not blank/misleading text', () => {
    render(
      <PaymentPill
        state="refunded"
        kind="Deposit"
        amount={340000}
        dueDate="2026-04-08"
      />,
    );
    // Truthful long form: "Deposit $3,400 refunded {date}" — must NOT read
    // as still pending/due, and must NOT silently fall back to a blank
    // pill. The exact day isn't asserted (toLocaleDateString on a bare
    // ISO date can shift by a day across timezones); the verb + amount are
    // the load-bearing part of the fix.
    expect(screen.getByText(/Deposit \$3,400 refunded/)).toBeInTheDocument();
  });

  it('is visually distinct from the "paid" (success) tint', () => {
    const { container: refundedContainer } = render(<PaymentPill state="refunded" />);
    const { container: paidContainer } = render(<PaymentPill state="paid" />);
    // jsdom's CSSOM drops `color: var(--custom-prop)` declarations from the
    // serialized style entirely, so assert on `background-color` instead
    // (a plain rgba() value, which jsdom keeps) — the two states must use
    // different tints, not the same one re-labeled.
    const refundedBg = refundedContainer.querySelector('span')?.style.backgroundColor;
    const paidBg = paidContainer.querySelector('span')?.style.backgroundColor;
    expect(refundedBg).toBeTruthy();
    expect(refundedBg).not.toBe(paidBg);
  });
});
