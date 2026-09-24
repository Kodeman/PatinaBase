import { act, fireEvent, render, screen } from '@testing-library/react';
import { AccountBand } from '../account-band';

const mockGenerate = jest.fn();
const mockRefetch = jest.fn();
const amendmentSheet = jest.fn();
let mockInvoiceId: string | null = null;
let mockQueryState: 'ready' | 'loading' | 'error' = 'ready';
let mockAccountOverride: Record<string, unknown> = {};

const mockAccountData = () => ({
  budgetCents: 50_000,
  totalAmountCents: 50_000,
  designFeeCents: 5_000,
  committedCents: 0,
  committed: { currency: 'USD', cents: 0 },
  margin: { currency: 'USD', cents: 0 },
  clientValueCents: 0,
  tradeCostCents: 0,
  tradeCoverage: { withTrade: 0, total: 0 },
  marginPct: null,
  estCommissionCents: 0,
  rooms: [],
  milestones: [
    {
      id: 'milestone-1',
      label: 'Project deposit',
      percentage: 50,
      amount_cents: 25_000,
      status: 'pending',
      due_date: null,
      paid_at: null,
      trigger_kind: 'on_signing',
      trigger_section_key: null,
      invoice_id: mockInvoiceId,
      sort_order: 0,
    },
  ],
  ...mockAccountOverride,
});

jest.mock('@/hooks/use-account-page', () => ({
  useAccountPage: () => ({
    data: mockQueryState === 'ready' ? mockAccountData() : undefined,
    isLoading: mockQueryState === 'loading',
    isError: mockQueryState === 'error',
    refetch: mockRefetch,
  }),
  useUpdateMilestoneTrigger: () => ({ mutate: jest.fn() }),
  useGenerateMilestoneInvoice: () => ({
    mutate: mockGenerate,
    isPending: false,
  }),
  exportAccountsQbo: jest.fn(),
}));

jest.mock('../overlays/amendment-sheet', () => ({
  AmendmentSheet: (props: { open: boolean }) => {
    amendmentSheet(props);
    return props.open ? <div>Change sheet open</div> : null;
  },
}));

jest.mock('../command-bar', () => ({
  openLedger: jest.fn(),
}));

describe('AccountBand root spacing', () => {
  beforeEach(() => {
    mockInvoiceId = null;
    mockQueryState = 'ready';
  });

  it('takes the one region gap standing alone between care and the Record', () => {
    // B7: the standalone band is an organ between two stops, so its top edge is
    // the region token and it carries no bottom margin.
    const { container } = render(<AccountBand projectId="project-1" />);

    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('mt-[var(--doc-region-gap)]');
    expect(
      root.className.split(/\s+/).filter((cls) => /^m[trblxy]?-/.test(cls)),
    ).toEqual(['mt-[var(--doc-region-gap)]']);
  });

  it('keeps the money region\u2019s own rhythm when it rides headless inside it', () => {
    const { container } = render(<AccountBand projectId="project-1" headless />);

    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('mt-4');
    expect(root.className).not.toContain('--doc-region-gap');
  });
});

describe('AccountBand invoice handoff', () => {
  beforeEach(() => {
    mockInvoiceId = null;
    mockQueryState = 'ready';
    mockRefetch.mockClear();
    amendmentSheet.mockClear();
  });

  it('keeps the account surface visible while its authoritative read loads', () => {
    mockQueryState = 'loading';
    render(<AccountBand projectId="project-1" />);

    expect(screen.getByRole('status')).toHaveTextContent('opening the ledger');
  });

  it('surfaces query failure and lets the designer retry', () => {
    mockQueryState = 'error';
    render(<AccountBand projectId="project-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The project accounts could not be opened.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failed recovery draft at the milestone', () => {
    mockGenerate.mockImplementation((_id: string, callbacks: { onError: (error: Error) => void }) =>
      callbacks.onError(new Error('milestone is already billed')),
    );

    render(<AccountBand projectId="project-1" />);
    fireEvent.click(screen.getByRole('button', { name: /The accounts/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate invoice' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not draft the invoice — milestone is already billed',
    );
  });

  it('opens an existing activation invoice instead of showing a dead label', () => {
    mockInvoiceId = 'invoice-1';
    const opened = jest.fn();
    window.addEventListener('document:open-invoice-folio', opened);

    render(<AccountBand projectId="project-1" />);
    fireEvent.click(screen.getByRole('button', { name: /The accounts/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open invoice' }));

    expect(opened).toHaveBeenCalledTimes(1);
    expect((opened.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      invoiceId: 'invoice-1',
    });
    window.removeEventListener('document:open-invoice-folio', opened);
  });

  it('uses the change workflow as the only post-project add doorway', () => {
    render(<AccountBand projectId="project-1" activeSection="install" />);
    fireEvent.click(screen.getByRole('button', { name: /The accounts/ }));

    expect(screen.getByRole('button', { name: 'Add a change' })).toBeInTheDocument();
    act(() => window.dispatchEvent(new CustomEvent('document:open-project-change')));
    expect(screen.getByText('Change sheet open')).toBeInTheDocument();
  });

  it('renders its own "Draw an invoice" primary by default (byte-identical standalone mount)', () => {
    render(<AccountBand projectId="project-1" />);
    fireEvent.click(screen.getByRole('button', { name: /The accounts/ }));

    expect(screen.getByRole('button', { name: 'Draw an invoice' })).toBeInTheDocument();
  });

  it('drops its own "Draw an invoice" primary when headless, keeping export + amendment', () => {
    render(<AccountBand projectId="project-1" headless />);
    fireEvent.click(screen.getByRole('button', { name: /The accounts/ }));

    expect(
      screen.queryByRole('button', { name: 'Draw an invoice' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export · QBO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Amendment' })).toBeInTheDocument();
  });

  it('stands every per-milestone act down from primary when headless', () => {
    // The Money region's head already carries the one inked leader; a milestone
    // row printing a primary beside it would be a second leader on the page.
    render(<AccountBand projectId="project-1" headless />);
    fireEvent.click(screen.getByRole('button', { name: /The accounts/ }));

    expect(document.querySelectorAll('[data-action-variant="primary"]')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Generate invoice' })).toHaveAttribute(
      'data-action-variant',
      'secondary',
    );
  });

  it('keeps the milestone act primary on the standalone mount', () => {
    render(<AccountBand projectId="project-1" />);
    fireEvent.click(screen.getByRole('button', { name: /The accounts/ }));

    expect(screen.getByRole('button', { name: 'Generate invoice' })).toHaveAttribute(
      'data-action-variant',
      'primary',
    );
  });

  it('opens the amendment sheet from the document:compose-amendment event', () => {
    render(<AccountBand projectId="project-1" headless />);

    act(() => window.dispatchEvent(new CustomEvent('document:compose-amendment')));
    expect(screen.getByText('Change sheet open')).toBeInTheDocument();
  });

  it('removes the compose-amendment listener on unmount rather than leaking a state update', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = render(<AccountBand projectId="project-1" headless />);

    unmount();
    act(() => window.dispatchEvent(new CustomEvent('document:compose-amendment')));

    expect(
      errorSpy.mock.calls.some((call) =>
        String(call[0]).includes('state update on an unmounted component'),
      ),
    ).toBe(false);
    errorSpy.mockRestore();
  });
});

describe('AccountBand currencies (SQ-207)', () => {
  beforeEach(() => {
    mockInvoiceId = null;
    mockQueryState = 'ready';
  });
  afterEach(() => {
    mockAccountOverride = {};
  });

  const usdRoom = {
    roomId: 'r1',
    roomName: 'Living',
    allocatedCents: 500_000,
    committedCents: 420_000,
    committed: { currency: 'USD', cents: 420_000 },
    varianceCents: 80_000,
    varianceMixed: null,
    categories: [{ name: 'fixed', committedCents: 420_000, committed: { currency: 'USD', cents: 420_000 } }],
  };

  it('prints an all-USD account exactly as before', () => {
    mockAccountOverride = {
      committedCents: 420_000,
      committed: { currency: 'USD', cents: 420_000 },
      clientValueCents: 420_000,
      tradeCostCents: 300_000,
      margin: { currency: 'USD', cents: 420_000 },
      marginPct: 29,
      estCommissionCents: 120_000,
      tradeCoverage: { withTrade: 1, total: 1 },
      rooms: [usdRoom],
    };
    const { container } = render(<AccountBand projectId="project-1" />);
    const head = screen.getByRole('button', { name: /The accounts/ });
    expect(head).toHaveTextContent('$500 budget · $4,200 committed · 29% margin');
    fireEvent.click(head);
    expect(screen.getByText('$800 under')).toBeInTheDocument();
    expect(screen.getByText('fixed $4,200')).toBeInTheDocument();
    expect(container).toHaveTextContent('Trade $3,000 → client $4,200 · 29% margin');
    expect(container).toHaveTextContent('est. commissions $1,200');
    expect(container).not.toHaveTextContent('Mixed currencies');
  });

  it('refuses to add committed lines across currencies', () => {
    const mixed = { mixed: ['EUR', 'USD'] };
    mockAccountOverride = {
      committed: mixed,
      margin: mixed,
      rooms: [
        {
          ...usdRoom,
          committedCents: 0,
          committed: mixed,
          varianceCents: 0,
          varianceMixed: ['EUR', 'USD'],
          categories: [{ name: 'fixed', committedCents: 0, committed: mixed }],
        },
      ],
    };
    render(<AccountBand projectId="project-1" />);
    const head = screen.getByRole('button', { name: /The accounts/ });
    expect(head).toHaveTextContent('Mixed currencies — total unavailable (EUR, USD) committed');
    fireEvent.click(head);
    expect(screen.getByText(/Margin: Mixed currencies — total unavailable \(EUR, USD\)/)).toBeInTheDocument();
    expect(screen.queryByText(/under|over$/)).not.toBeInTheDocument();
    expect(screen.getByText('fixed Mixed currencies — total unavailable (EUR, USD)')).toBeInTheDocument();
  });
});
