import { fireEvent, render, screen } from '@testing-library/react';
import { AccountBand } from '../account-band';

const mockGenerate = jest.fn();
let mockInvoiceId: string | null = null;

jest.mock('@/hooks/use-account-page', () => ({
  useAccountPage: () => ({
    data: {
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
    },
  }),
  useUpdateMilestoneTrigger: () => ({ mutate: jest.fn() }),
  useGenerateMilestoneInvoice: () => ({
    mutate: mockGenerate,
    isPending: false,
  }),
  exportAccountsQbo: jest.fn(),
}));

jest.mock('../overlays/amendment-sheet', () => ({
  AmendmentSheet: () => null,
}));

jest.mock('../command-bar', () => ({
  openLedger: jest.fn(),
}));

describe('AccountBand invoice handoff', () => {
  beforeEach(() => {
    mockInvoiceId = null;
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
});
