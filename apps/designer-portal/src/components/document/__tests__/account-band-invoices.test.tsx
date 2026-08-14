import { act, fireEvent, render, screen } from '@testing-library/react';
import { AccountBand } from '../account-band';

const mockGenerate = jest.fn();
const mockRefetch = jest.fn();
const amendmentSheet = jest.fn();
let mockInvoiceId: string | null = null;
let mockQueryState: 'ready' | 'loading' | 'error' = 'ready';

const mockAccountData = () => ({
  budgetCents: 50_000,
  totalAmountCents: 50_000,
  designFeeCents: 5_000,
  committedCents: 0,
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
