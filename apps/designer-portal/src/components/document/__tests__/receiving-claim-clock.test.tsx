/** Claim clocks use entered vendor terms; an unknown term never invents a date. */
import { render, screen } from '@testing-library/react';
import { ClaimClockLine, claimClockSentence } from '../line-unfold/claim-clock';

let clock: Record<string, unknown> | null = null;
const mockAccountsRead = jest.fn(() => ({ data: [], isPending: false, isSuccess: true }));

jest.mock('@patina/supabase', () => ({
  useProcurementClaimDeadline: () => ({ data: clock }),
  useStudioVendorAccounts: () => mockAccountsRead(),
}));
jest.mock('@/hooks/use-viewer-studio', () => ({
  useInternalTimeStudio: () => ({ studio: { id: 'studio-1' }, isSettled: true }),
}));

describe('claimClockSentence', () => {
  it('names the vendor account when the account sets the window', () => {
    expect(claimClockSentence({
      vendorName: 'Hewn', deadline: '2026-10-16', windowDays: 3, today: '2026-10-14',
    })).toEqual({
      sentence: 'Hewn wants written notice by Fri 16 October (72 hours from delivery, per the Hewn account).',
      passed: false,
    });
  });

  it('reports an unknown notice window instead of a studio default', () => {
    expect(claimClockSentence({
      vendorName: 'Hale Upholstery', deadline: null, windowDays: null,
    })).toEqual({ sentence: 'Notice window unknown — add vendor terms', passed: false });
  });

  it('does not print a stale deadline when the term is unknown', () => {
    expect(claimClockSentence({
      vendorName: 'Hewn', deadline: '2020-01-03', windowDays: null,
    })).toEqual({ sentence: 'Notice window unknown — add vendor terms', passed: false });
  });

  it('states a longer account window in days', () => {
    expect(claimClockSentence({
      vendorName: 'Hewn', deadline: '2026-10-18', windowDays: 5, today: '2026-10-14',
    })?.sentence).toBe('Hewn wants written notice by Sun 18 October (5 days from delivery, per the Hewn account).');
  });

  it('turns to the closed sentence the day after the deadline, never a countdown', () => {
    expect(claimClockSentence({
      vendorName: 'Hewn', deadline: '2026-10-16', windowDays: 3, today: '2026-10-16',
    })?.passed).toBe(false);
    expect(claimClockSentence({
      vendorName: 'Hewn', deadline: '2026-10-16', windowDays: 3, today: '2026-10-17',
    })).toEqual({
      sentence: "Hewn's window closed Fri 16 October (72 hours from delivery, per the Hewn account) — you can still file.",
      passed: true,
    });
  });

  it('is silent with known terms but no delivery date', () => {
    expect(claimClockSentence({ vendorName: 'Hewn', deadline: null, windowDays: 3 })).toBeNull();
  });

  it('keeps an explicitly entered zero-day term known', () => {
    expect(claimClockSentence({
      vendorName: 'Hewn', deadline: '2026-10-16', windowDays: 0, today: '2026-10-16',
    })?.sentence).toBe('Hewn wants written notice by Fri 16 October (0 hours from delivery, per the Hewn account).');
  });
});

describe('ClaimClockLine', () => {
  it('prints a passed deadline in the golden-ink token', () => {
    clock = { vendor_deadline: '2020-01-03', claims_window_days: 3 };
    render(<ClaimClockLine purchaseOrderId="po-1" vendorId="v-1" vendorName="Hewn" />);
    const line = screen.getByTestId('claim-clock');
    expect(line).toHaveAttribute('data-passed', 'true');
    expect(line.className).toContain('text-[var(--color-golden-hour-ink)]');
    expect(line).toHaveTextContent("Hewn's window closed");
    expect(line).toHaveTextContent('per the Hewn account');
  });

  it('prints an open deadline in charcoal using the authoritative entered term', () => {
    clock = { vendor_deadline: '2999-01-03', claims_window_days: 2 };
    render(<ClaimClockLine purchaseOrderId="po-1" vendorId="v-1" vendorName="Hewn" />);
    const line = screen.getByTestId('claim-clock');
    expect(line).not.toHaveAttribute('data-passed');
    expect(line.className).not.toContain('golden-hour-ink');
    expect(line).toHaveTextContent('Hewn wants written notice by Thu 3 January (48 hours from delivery, per the Hewn account).');
  });

  it('shows the unknown-window prompt without a deadline or account lookup', () => {
    mockAccountsRead.mockClear();
    clock = { vendor_deadline: null, claims_window_days: null };
    render(<ClaimClockLine purchaseOrderId="po-1" vendorId="v-1" vendorName="Hewn" />);
    const line = screen.getByTestId('claim-clock');
    expect(line).toHaveTextContent('Notice window unknown — add vendor terms');
    expect(mockAccountsRead).not.toHaveBeenCalled();
    expect(line).not.toHaveAttribute('data-passed');
    expect(line.className).not.toContain('golden-hour-ink');
  });

  it('prints nothing before the PO has a delivered date and the term is known', () => {
    clock = { vendor_deadline: null, claims_window_days: 3 };
    const { container } = render(<ClaimClockLine purchaseOrderId="po-1" vendorId="v-1" vendorName="Hewn" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prints nothing while the clock is unreadable', () => {
    clock = null;
    const { container } = render(<ClaimClockLine purchaseOrderId="po-1" vendorId="v-1" vendorName="Hewn" />);
    expect(container).toBeEmptyDOMElement();
  });
});
