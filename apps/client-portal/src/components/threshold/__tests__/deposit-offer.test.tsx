import { render, screen } from '@testing-library/react';

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  proposalClientEvents: { signed: jest.fn() },
  makingEvents: {
    gateFollowed: jest.fn(),
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

import { DepositOffer, type DepositOfferModel } from '../deposit-offer';

const OFFER: DepositOfferModel = {
  invoiceId: 'inv-deposit',
  amountCents: 841_340,
  label: 'Deposit at signing',
  payPath: `/pay/${'a'.repeat(64)}`,
};

/* ── SIGN, THEN OFFER (P13 · R15) ────────────────────────────────────────────
   The three rules the reviewer checks, said as tests: the offer renders when
   there is one; it renders NOTHING when there is not — no error, no retry
   prompt, no "payment unavailable"; and it is a plain link to the shipped
   payer surface, with no Checkout call of its own. ────────────────────────── */

describe('DepositOffer', () => {
  it('names the amount to the cent, and links to the payer surface', () => {
    render(<DepositOffer offer={OFFER} drawCount={5} />);

    expect(screen.getByTestId('deposit-offer')).toHaveTextContent(
      'Your deposit is ready — $8,413.40',
    );
    expect(screen.getByTestId('deposit-offer')).toHaveTextContent('due on signing');
    expect(screen.getByTestId('deposit-offer')).toHaveTextContent(
      'You can pay now, or your studio will send it.',
    );
    expect(screen.getByRole('link', { name: 'Pay the deposit' })).toHaveAttribute(
      'href',
      `/pay/${'a'.repeat(64)}`,
    );
  });

  /**
   * A failure is SILENCE. The sign route returns `depositOffer: null` for
   * every failure shape it has — the RPC refused, the RPC threw, the invoice
   * carries no pay link yet, the agreement has no deposit draw — and none of
   * them is the homeowner's problem to read about on the receipt for her own
   * signature.
   */
  it('renders nothing at all when there is no offer', () => {
    const { container } = render(<DepositOffer offer={null} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('deposit-offer')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/try again/i)).not.toBeInTheDocument();
  });

  it('names the draw’s own label when it does not know how many draws there are', () => {
    render(<DepositOffer offer={OFFER} drawCount={null} />);

    expect(screen.getByTestId('deposit-offer')).toHaveTextContent(
      'Deposit at signing · due on signing.',
    );
  });

  it('counts the draws in words, never as a numeral chip', () => {
    render(<DepositOffer offer={OFFER} drawCount={5} />);

    expect(screen.getByTestId('deposit-offer')).toHaveTextContent(
      'The first of five draws · due on signing.',
    );
  });

  it('says a whole-dollar deposit without the trailing cents', () => {
    render(<DepositOffer offer={{ ...OFFER, amountCents: 500_000 }} drawCount={null} />);

    expect(screen.getByTestId('deposit-offer')).toHaveTextContent('$5,000');
    expect(screen.getByTestId('deposit-offer')).not.toHaveTextContent('$5,000.00');
  });

  /* Wave 3 writes no Stripe code: the act is an anchor to a route the payer
     surface already owns, not a button that mints anything. */
  it('is a link, not an act that charges anything', () => {
    render(<DepositOffer offer={OFFER} />);

    const act = screen.getByRole('link', { name: 'Pay the deposit' });
    expect(act.tagName).toBe('A');
    expect(screen.queryByRole('button', { name: /pay/i })).not.toBeInTheDocument();
  });

  it('does not shout at her: no red, no badge, no count pill', () => {
    render(<DepositOffer offer={OFFER} drawCount={5} />);

    const region = screen.getByTestId('deposit-offer');
    expect(region.className).not.toMatch(/terracotta|red/);
    expect(region.textContent ?? '').not.toMatch(/overdue|dashboard|task|gate/i);
  });
});
