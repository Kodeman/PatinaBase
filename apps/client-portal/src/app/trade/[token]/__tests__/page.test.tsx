import { render, screen } from '@testing-library/react';
import TradeAgreementLinkPage from '../page';
import { createServiceClient } from '@patina/supabase/server';

jest.mock('@patina/supabase/server', () => ({
  createServiceClient: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
jest.mock('../trade-agreement-signature', () => ({
  TradeAgreementSignature: () => <div>trade-agreement-signature</div>,
}));

const validToken = 'a'.repeat(64);

const dto = (overrides: Record<string, unknown> = {}) => ({
  studioName: 'Middle West Studio',
  agreementTitle: 'Cabinetry & millwork',
  contactDisplayName: 'Halloran Cabinet Co.',
  scope: 'Build and install the kitchen and mudroom casework as drawn.',
  priceCents: 3_800_000,
  currency: 'USD',
  schedule: { startOn: '2026-10-12', durationDays: 21, sequencing: 'After rough-in inspection.' },
  retainageBps: 500,
  payWhenPaidDays: 7,
  insuranceCertificateRequired: true,
  lienWaiverPolicy: 'conditional_then_unconditional',
  state: 'sent',
  existingSignature: null,
  ...overrides,
});

function mockResolve(data: unknown, error: unknown = null) {
  (createServiceClient as jest.Mock).mockReturnValue({
    rpc: jest.fn().mockResolvedValue({ data, error }),
  });
}

describe('/trade/[token]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('404s a malformed token before any DB round-trip', async () => {
    await expect(
      TradeAgreementLinkPage({ params: Promise.resolve({ token: 'not-a-token' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('404s a token the resolver could not answer for — invalid, revoked, expired, draft or void alike', async () => {
    mockResolve(null);
    await expect(
      TradeAgreementLinkPage({ params: Promise.resolve({ token: validToken }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404s when the resolver call itself errors', async () => {
    mockResolve(null, { message: 'boom' });
    await expect(
      TradeAgreementLinkPage({ params: Promise.resolve({ token: validToken }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('resolves through resolve_trade_agreement_link with the raw token and nothing else', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: dto(), error: null });
    (createServiceClient as jest.Mock).mockReturnValue({ rpc });
    render(await TradeAgreementLinkPage({ params: Promise.resolve({ token: validToken }) }));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('resolve_trade_agreement_link', { p_token: validToken });
  });

  it('renders the studio, the title, the party and the eight essentials as sentences', async () => {
    mockResolve(dto());
    render(await TradeAgreementLinkPage({ params: Promise.resolve({ token: validToken }) }));

    expect(screen.getByText('Middle West Studio · Trade Agreement')).toBeInTheDocument();
    expect(screen.getByText('Cabinetry & millwork')).toBeInTheDocument();
    expect(screen.getByText('Halloran Cabinet Co.')).toBeInTheDocument();
    expect(
      screen.getByText('Build and install the kitchen and mudroom casework as drawn.'),
    ).toBeInTheDocument();
    // THEIR price, to the cent.
    expect(screen.getByText('$38,000')).toBeInTheDocument();
    expect(screen.getByText(/Starts 12 October 2026 · 21 days on site/)).toBeInTheDocument();
    expect(screen.getByText(/After rough-in inspection\./)).toBeInTheDocument();
    expect(
      screen.getByText('5% of each payment is held back until the work is complete.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The studio pays you within 7 days of being paid for this work.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('A certificate of insurance is required before you start.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'A conditional waiver with each payment request, an unconditional one once that payment clears.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('trade-agreement-signature')).toBeInTheDocument();
  });

  it('prints cents when the price carries them', async () => {
    mockResolve(dto({ priceCents: 3_800_050 }));
    render(await TradeAgreementLinkPage({ params: Promise.resolve({ token: validToken }) }));
    expect(screen.getByText('$38,000.50')).toBeInTheDocument();
  });

  it('omits the schedule line entirely when the agreement carries no schedule', async () => {
    mockResolve(dto({ schedule: null }));
    render(await TradeAgreementLinkPage({ params: Promise.resolve({ token: validToken }) }));
    expect(screen.queryByText('Schedule')).not.toBeInTheDocument();
    // The remaining essentials still stand.
    expect(screen.getByText('Retainage')).toBeInTheDocument();
  });

  it.each([
    ['no retainage at all', { retainageBps: 0 }, 'Nothing is held back from your payments.'],
    [
      'a fractional retainage',
      { retainageBps: 250 },
      '2.5% of each payment is held back until the work is complete.',
    ],
    [
      'no pay-when-paid condition',
      { payWhenPaidDays: null },
      'Your payment is not held for the studio being paid.',
    ],
    [
      'a pay-when-paid of zero days',
      { payWhenPaidDays: 0 },
      'The studio pays you as soon as it is paid for this work.',
    ],
    [
      'a pay-when-paid of one day',
      { payWhenPaidDays: 1 },
      'The studio pays you within 1 day of being paid for this work.',
    ],
    [
      'no certificate of insurance',
      { insuranceCertificateRequired: false },
      'No certificate of insurance is required for this work.',
    ],
    ['no lien waiver', { lienWaiverPolicy: 'none' }, 'No lien waiver is asked of you.'],
    [
      'an unconditional-on-final waiver',
      { lienWaiverPolicy: 'unconditional_on_final' },
      'An unconditional waiver with the final payment.',
    ],
    [
      'a one-day duration',
      { schedule: { startOn: null, durationDays: 1, sequencing: null } },
      '1 day on site',
    ],
    [
      'a sequencing note and no dates',
      { schedule: { startOn: null, durationDays: null, sequencing: 'After the tile is set.' } },
      'After the tile is set.',
    ],
    [
      'an unparsable start date',
      { schedule: { startOn: 'not-a-date', durationDays: 14, sequencing: null } },
      '14 days on site',
    ],
    ['a currency the DTO spells oddly', { currency: 'not-a-currency' }, '$38,000'],
  ])('says the right sentence for %s', async (_name, overrides, sentence) => {
    mockResolve(dto(overrides));
    render(await TradeAgreementLinkPage({ params: Promise.resolve({ token: validToken }) }));
    expect(screen.getByText(sentence, { exact: false })).toBeInTheDocument();
  });

  it('never prints a lien-waiver policy key as copy when it does not know the policy', async () => {
    mockResolve(dto({ lienWaiverPolicy: 'some_future_policy' }));
    const { container } = render(
      await TradeAgreementLinkPage({ params: Promise.resolve({ token: validToken }) }),
    );
    expect(container).not.toHaveTextContent('some_future_policy');
    expect(
      screen.getByText('Lien waivers are exchanged as your studio sets out with each payment.'),
    ).toBeInTheDocument();
  });

  it('falls back to a plain studio label when none is on the DTO', async () => {
    mockResolve(dto({ studioName: null, agreementTitle: null }));
    render(await TradeAgreementLinkPage({ params: Promise.resolve({ token: validToken }) }));
    expect(screen.getByText('Patina · Trade Agreement')).toBeInTheDocument();
    expect(screen.getByText('Trade Agreement')).toBeInTheDocument();
  });

  it('never renders the client’s money, another sub, the bid ledger or the project name, even if the resolver DTO carried them (R13)', async () => {
    mockResolve({
      ...dto(),
      // A DTO shaped like this would be a server-side contract bug (the RPC
      // itself must never emit these). This pins the page to rendering only
      // the typed keys it destructures, so a leak upstream still cannot reach
      // the DOM here. projectName in particular: a project name routinely
      // carries the client's surname ('the Halvorsen residence'), which is
      // exactly why resolve_trade_rfq_link's DTO dropped it (00424) and why
      // this one does too.
      clientPriceCents: 8_413_400,
      gmp: 8_413_400,
      scheduleOfValues: [{ label: 'Cabinetry & millwork', amountCents: 4_484_000 }],
      draws: [{ label: 'Deposit at signing', grossCents: 841_340 }],
      projectName: 'The Halvorsen Residence',
      bids: [{ contactDisplayName: 'Ridgeline Millwork', amountCents: 4_100_000 }],
      otherSubCount: 4,
    });
    const { container } = render(
      await TradeAgreementLinkPage({ params: Promise.resolve({ token: validToken }) }),
    );

    expect(container).not.toHaveTextContent('Halvorsen');
    expect(container).not.toHaveTextContent('Ridgeline Millwork');
    // 8_413_400 formatted ($84,134) or raw; the same for the SOV line, the
    // draw and the losing bid.
    expect(container).not.toHaveTextContent('$84,134');
    expect(container).not.toHaveTextContent('8413400');
    expect(container).not.toHaveTextContent('$44,840');
    expect(container).not.toHaveTextContent('$8,413.40');
    expect(container).not.toHaveTextContent('$41,000');
  });
});
