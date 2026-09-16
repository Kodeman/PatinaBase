/**
 * THE UNSUBSCRIBE LANDING SAYS WHAT THE WRITE DID (W4 r5 F2).
 *
 * The client portal carries its own sibling of the admin portal's landing.
 * The admin one learned in W4 r4 to speak from the scope the record wrote;
 * this one still branched on the token's narrow type, so a real channel-scoped
 * token applied through this portal stopped the whole address while the page
 * printed "We've unsubscribed you from po sent emails". Neither this page nor
 * its route carried any test at all.
 */
import { render, screen } from '@testing-library/react';
import UnsubscribePage from '../page';

async function renderPage(params: Record<string, string>) {
  const ui = await UnsubscribePage({ searchParams: Promise.resolve(params) });
  return render(ui);
}

describe('the client-portal unsubscribe landing', () => {
  it('names the whole address when the stop landed on the address', async () => {
    await renderPage({ status: 'applied', type: 'po_sent', scope: 'address' });

    expect(
      screen.getByText(
        "We've stopped all email from this studio to this address, including invoices and purchase orders.",
      ),
    ).toBeInTheDocument();
    // The letter's own type is not a description of what was written.
    expect(screen.queryByText(/po sent emails/i)).not.toBeInTheDocument();
    // There is no account to manage preferences in.
    expect(
      screen.queryByRole('link', { name: 'Manage Preferences' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Ask the studio to send again/)).toBeInTheDocument();
  });

  it('still names the type for an account holder, whose stop is one column', async () => {
    await renderPage({ status: 'applied', type: 'price_drop', scope: 'account' });

    expect(
      screen.getByText("We've unsubscribed you from price drop emails."),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage Preferences' })).toBeInTheDocument();
  });

  it('keeps the all_marketing sentence for an account holder', async () => {
    await renderPage({ status: 'applied', type: 'all_marketing', scope: 'account' });

    expect(screen.getByText(/turned off all marketing emails/i)).toBeInTheDocument();
  });

  it('falls back to the type when no scope crossed the redirect', async () => {
    await renderPage({ status: 'applied', type: 'price_drop' });

    expect(
      screen.getByText("We've unsubscribed you from price drop emails."),
    ).toBeInTheDocument();
  });

  it('ignores a scope value the record never writes', async () => {
    await renderPage({ status: 'applied', type: 'price_drop', scope: 'everything' });

    expect(
      screen.getByText("We've unsubscribed you from price drop emails."),
    ).toBeInTheDocument();
  });

  it('offers rather than applies when a token arrives on a GET', async () => {
    await renderPage({ token: 'tok' });

    expect(screen.getByTestId('unsubscribe-confirm')).toBeInTheDocument();
    expect(screen.getByText('Turn these emails off?')).toBeInTheDocument();
  });

  it('says a refusal in its own words and offers no unsubscribe copy', async () => {
    await renderPage({ status: 'expired', type: 'po_sent', scope: 'address' });

    expect(screen.getByText(/This unsubscribe link has expired/)).toBeInTheDocument();
    expect(screen.queryByText(/We've stopped all email/)).not.toBeInTheDocument();
  });

  it('refuses an empty arrival', async () => {
    await renderPage({});

    expect(screen.getByText(/missing required information/)).toBeInTheDocument();
  });
});
