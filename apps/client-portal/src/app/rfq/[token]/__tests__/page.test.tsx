import { render, screen } from '@testing-library/react';
import TradeRfqLinkPage from '../page';
import { createServiceClient } from '@patina/supabase/server';

jest.mock('@patina/supabase/server', () => ({
  createServiceClient: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
jest.mock('../rfq-response-form', () => ({
  RfqResponseForm: () => <div>rfq-response-form</div>,
}));

const validToken = 'a'.repeat(64);

const dto = (overrides: Record<string, unknown> = {}) => ({
  studioName: 'Atelier North',
  scopeTitle: 'Millwork — kitchen & pantry',
  partyDisplayName: 'Winfield Workroom',
  sections: [{ roomName: 'Kitchen', prose: 'Paneled ends, inset doors, painted finish.' }],
  timeline: 'Install by October',
  message: 'Let us know if you need drawings.',
  rfq: { id: 'rfq-1', status: 'sent', respondedAt: null },
  existingResponse: null,
  ...overrides,
});

function mockResolve(data: unknown, error: unknown = null) {
  (createServiceClient as jest.Mock).mockReturnValue({
    rpc: jest.fn().mockResolvedValue({ data, error }),
  });
}

describe('/rfq/[token]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('404s a malformed token before any DB round-trip', async () => {
    await expect(
      TradeRfqLinkPage({ params: Promise.resolve({ token: 'not-a-token' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('404s a token the resolver could not answer for — invalid, revoked, or expired alike', async () => {
    mockResolve(null);
    await expect(
      TradeRfqLinkPage({ params: Promise.resolve({ token: validToken }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404s when the resolver call itself errors', async () => {
    mockResolve(null, { message: 'boom' });
    await expect(
      TradeRfqLinkPage({ params: Promise.resolve({ token: validToken }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders the studio, scope, and room-headed prose for a live request', async () => {
    mockResolve(dto());
    render(await TradeRfqLinkPage({ params: Promise.resolve({ token: validToken }) }));
    expect(screen.getByText('Millwork — kitchen & pantry')).toBeInTheDocument();
    expect(screen.getByText(/Winfield Workroom/)).toBeInTheDocument();
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Paneled ends, inset doors, painted finish.')).toBeInTheDocument();
    expect(screen.getByText(/Install by October/)).toBeInTheDocument();
    expect(screen.getByText('Let us know if you need drawings.')).toBeInTheDocument();
    expect(screen.getByText('rfq-response-form')).toBeInTheDocument();
  });

  it('offers the form regardless of the DTO’s own status field — resolve_trade_rfq_link never resolves a closed ask', async () => {
    // resolve_trade_rfq_link answers NULL for a closed ask (its token is
    // revoked in the same transaction that closes it) — a resolved DTO is,
    // by construction, always an answerable one. The page no longer branches
    // on rfq.status at all; the "work has been awarded" sentence belongs to
    // the ACTION's bid_window_closed outcome (rfq-response-form.test.tsx),
    // never to a status read off this page's own DTO. This pins that a
    // stray 'closed' value on the DTO (a server-side contract bug, same
    // class as the price/bid leak below) does not resurrect a dead branch.
    mockResolve(dto({ rfq: { id: 'rfq-1', status: 'closed', respondedAt: null } }));
    render(await TradeRfqLinkPage({ params: Promise.resolve({ token: validToken }) }));
    expect(screen.getByText('rfq-response-form')).toBeInTheDocument();
    expect(
      screen.queryByText('This request is closed — the work has been awarded.'),
    ).not.toBeInTheDocument();
  });

  it('never renders a scope price, another party’s bid, or the project name, even if the resolver DTO carried one', async () => {
    mockResolve({
      ...dto(),
      // A DTO shaped like this would be a server-side contract bug (the RPC
      // itself must never emit these) — this pins the page to rendering only
      // the typed keys it destructures, so a leak upstream still can't reach
      // the DOM here. projectName in particular: a project name routinely
      // carries the client's surname ('the Ashford residence'), which is
      // exactly why resolve_trade_rfq_link's DTO dropped it (00424).
      clientPriceCents: 680_000,
      bids: [{ partyDisplayName: 'Hardwick Supply', amountCents: 715_000 }],
      projectName: 'The Ashford Residence',
    });
    render(await TradeRfqLinkPage({ params: Promise.resolve({ token: validToken }) }));
    expect(screen.queryByText(/Hardwick Supply/)).not.toBeInTheDocument();
    expect(screen.queryByText(/6,800|68,000|680,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/7,150|71,500|715,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ashford/)).not.toBeInTheDocument();
  });

  it('falls back to a plain studio label when none is on the DTO', async () => {
    mockResolve(dto({ studioName: null }));
    render(await TradeRfqLinkPage({ params: Promise.resolve({ token: validToken }) }));
    expect(screen.getByText(/^Patina · Request for a number$/)).toBeInTheDocument();
  });
});
