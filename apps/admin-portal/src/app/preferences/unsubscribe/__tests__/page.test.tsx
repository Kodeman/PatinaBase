/**
 * THE UNSUBSCRIBE LANDING SAYS WHAT THE WRITE DID (W4 r4 MAJOR-2).
 *
 * An account-less recipient's click marks the ADDRESS unsubscribed — every
 * email-kind channel carrying it, across every card and every studio — and the
 * send gate then refuses every category to it, invoices and purchase orders
 * included. The page read the token's own narrow type instead and told a
 * subcontractor's office manager "We've unsubscribed you from po sent emails"
 * while the studio's book had just stopped everything. Nothing covered it.
 */
import { render, screen } from '@testing-library/react';
import UnsubscribePage from '../page';

const mockApply = jest.fn();

jest.mock('@patina/notifications', () => ({
  applyUnsubscribeToken: (...args: unknown[]) => mockApply(...args),
}));

jest.mock('@/lib/admin-api', () => ({
  getServiceClient: () => ({}),
}));

async function renderPage(params: Record<string, string>) {
  const ui = await UnsubscribePage({ searchParams: Promise.resolve(params) });
  return render(ui);
}

describe('the unsubscribe landing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('names the whole address when the stop landed on the address', async () => {
    mockApply.mockResolvedValue({
      ok: true,
      status: 'applied',
      type: 'po_sent',
      scope: 'address',
      columnUpdated: 'status',
    });

    await renderPage({ token: 'tok' });

    expect(
      screen.getByText(
        "We've stopped all email from this studio to this address, including invoices and purchase orders.",
      ),
    ).toBeInTheDocument();
    // The letter's own type is not a description of what was written.
    expect(screen.queryByText(/po sent emails/i)).not.toBeInTheDocument();
    // There is no account to manage preferences in.
    expect(screen.queryByRole('link', { name: 'Manage Preferences' })).not.toBeInTheDocument();
  });

  it('carries the scope across the one-click redirect', async () => {
    // The GET route applies the token and redirects here with the outcome in
    // the query; without `scope` the page would read the narrow type again.
    await renderPage({ status: 'applied', type: 'invoice_sent', scope: 'address' });

    expect(mockApply).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "We've stopped all email from this studio to this address, including invoices and purchase orders.",
      ),
    ).toBeInTheDocument();
  });

  it('still names the type for an account holder, whose stop is one column', async () => {
    mockApply.mockResolvedValue({
      ok: true,
      status: 'applied',
      type: 'price_drop',
      scope: 'account',
      userId: 'user-1',
      columnUpdated: 'type_price_drop',
    });

    await renderPage({ token: 'tok' });

    expect(screen.getByText("We've unsubscribed you from price drop emails.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage Preferences' })).toBeInTheDocument();
  });

  it('keeps the all_marketing sentence for an account holder', async () => {
    mockApply.mockResolvedValue({
      ok: true,
      status: 'applied',
      type: 'all_marketing',
      scope: 'account',
      userId: 'user-1',
      columnUpdated: 'channels_email',
    });

    await renderPage({ token: 'tok' });

    expect(screen.getByText(/turned off all marketing emails/i)).toBeInTheDocument();
  });

  it('says a refusal in its own words and offers no unsubscribe copy', async () => {
    mockApply.mockResolvedValue({ ok: false, status: 'expired', type: 'po_sent', scope: 'address' });

    await renderPage({ token: 'tok' });

    expect(screen.getByText(/This unsubscribe link has expired/)).toBeInTheDocument();
    expect(screen.queryByText(/We've stopped all email/)).not.toBeInTheDocument();
  });
});
