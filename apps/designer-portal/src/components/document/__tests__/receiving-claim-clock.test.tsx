/**
 * C-20 (D1-08): the claim clock — one dated sentence on the receiving row,
 * golden ink once the date has passed, the basis named.
 */
import { render, screen } from '@testing-library/react';
import {
  ClaimClockLine,
  claimClockSentence,
} from '../line-unfold/claim-clock';

let clock: Record<string, unknown> | null = null;
let accounts: Array<Record<string, unknown>> = [];

jest.mock('@patina/supabase', () => ({
  useProcurementClaimDeadline: () => ({ data: clock }),
  useStudioVendorAccounts: () => ({
    data: accounts,
    isPending: false,
    isSuccess: true,
  }),
}));
jest.mock('@/hooks/use-viewer-studio', () => ({
  useInternalTimeStudio: () => ({ studio: { id: 'studio-1' }, isSettled: true }),
}));

describe('claimClockSentence', () => {
  it('names the vendor account when the account sets the window', () => {
    expect(
      claimClockSentence({
        vendorName: 'Hewn',
        deadline: '2026-10-16',
        windowDays: 3,
        basis: 'account',
        today: '2026-10-14',
      }),
    ).toEqual({
      sentence:
        'Hewn wants written notice by Fri 16 October (72 hours from delivery, per the Hewn account).',
      passed: false,
    });
  });

  it('names the studio default when no account window is set', () => {
    expect(
      claimClockSentence({
        vendorName: 'Hale Upholstery',
        deadline: '2026-10-31',
        windowDays: 3,
        basis: 'default',
        today: '2026-10-29',
      })?.sentence,
    ).toBe(
      'Hale Upholstery wants written notice by Sat 31 October (72 hours from delivery, the studio default).',
    );
  });

  it('states a longer account window in days', () => {
    expect(
      claimClockSentence({
        vendorName: 'Hewn',
        deadline: '2026-10-18',
        windowDays: 5,
        basis: 'account',
        today: '2026-10-14',
      })?.sentence,
    ).toBe(
      'Hewn wants written notice by Sun 18 October (5 days from delivery, per the Hewn account).',
    );
  });

  it('turns to the closed sentence the day after the deadline, never a countdown', () => {
    const onDay = claimClockSentence({
      vendorName: 'Hewn',
      deadline: '2026-10-16',
      windowDays: 3,
      basis: 'default',
      today: '2026-10-16',
    });
    expect(onDay?.passed).toBe(false);
    const after = claimClockSentence({
      vendorName: 'Hewn',
      deadline: '2026-10-16',
      windowDays: 3,
      basis: 'default',
      today: '2026-10-17',
    });
    expect(after).toEqual({
      sentence:
        "Hewn's window closed Fri 16 October (72 hours from delivery, the studio default) — you can still file.",
      passed: true,
    });
  });

  it('is silent with no deadline (not delivered yet)', () => {
    expect(
      claimClockSentence({
        vendorName: 'Hewn',
        deadline: null,
        windowDays: 3,
        basis: 'default',
      }),
    ).toBeNull();
  });
});

describe('ClaimClockLine', () => {
  beforeEach(() => {
    accounts = [];
  });

  it('prints a passed deadline in the golden-ink token', () => {
    clock = { vendor_deadline: '2020-01-03', claims_window_days: 3 };
    render(<ClaimClockLine purchaseOrderId="po-1" vendorId="v-1" vendorName="Hewn" />);
    const line = screen.getByTestId('claim-clock');
    expect(line).toHaveAttribute('data-passed', 'true');
    expect(line.className).toContain('text-[var(--color-golden-hour-ink)]');
    expect(line).toHaveTextContent("Hewn's window closed");
    expect(line).toHaveTextContent('the studio default');
  });

  it('prints an open deadline in charcoal and reads the basis off the account', () => {
    clock = { vendor_deadline: '2999-01-03', claims_window_days: 2 };
    accounts = [{ vendor_id: 'v-1', claims_window_days: 2 }];
    render(<ClaimClockLine purchaseOrderId="po-1" vendorId="v-1" vendorName="Hewn" />);
    const line = screen.getByTestId('claim-clock');
    expect(line).not.toHaveAttribute('data-passed');
    expect(line.className).not.toContain('golden-hour-ink');
    expect(line).toHaveTextContent(
      'Hewn wants written notice by Thu 3 January (48 hours from delivery, per the Hewn account).',
    );
  });

  it('prints nothing before the PO has a delivered date', () => {
    clock = { vendor_deadline: null, claims_window_days: 3 };
    const { container } = render(
      <ClaimClockLine purchaseOrderId="po-1" vendorId="v-1" vendorName="Hewn" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
