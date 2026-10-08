/**
 * US-19 FR2 (SQ-517): R37's arrival date request sits in the Movement cell of
 * the line it was asked from, and only there (511-R6), PO or none. A request
 * with no address says so and holds its Send (506-2).
 */

import { fireEvent, render, screen, within } from '@testing-library/react';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const mockDrafts: { data: Record<string, unknown>[] } = { data: [] };
jest.mock('@patina/supabase', () => ({
  OPEN_PROCUREMENT_DRAFT_STATUSES: ['awaiting_review', 'sending'],
  useProcurementDrafts: () => ({ data: mockDrafts.data }),
  useUpdateProcurementDraft: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSendProcurementDraft: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDiscardProcurementDraft: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useResendStalledProcurementDraft: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetPurchaseOrderTracking: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdatePurchaseOrderETA: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdatePurchaseOrderStatus: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePoShipments: () => ({ data: [] }),
  useProcurementItems: () => ({ data: [], isLoading: false }),
  useRecordPoShipment: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-folio', () => ({
  useUploadFolioFile: () => ({ mutateAsync: jest.fn(), isPending: false }),
  folioSignedUrl: jest.fn(),
}));
jest.mock('../../date-text-input', () => ({
  DateTextInput: ({ ariaLabel }: { ariaLabel?: string }) => <input aria-label={ariaLabel} />,
}));

import { MovementCell } from '../movement-cell';

const ASK = {
  id: 'ask-1',
  kind: 'maker_eta_request',
  status: 'awaiting_review',
  purchase_order_id: 'po-1',
  ffe_item_id: 'line-1',
  to_email: 'orders@hewn.test',
  subject: 'Arrival date: Walnut console',
  body: 'Hello,\n\nWhen will it arrive?',
};

const renderCell = (item: Record<string, unknown>, po: Record<string, unknown> | null) =>
  render(
    <MovementCell
      item={{ status: 'approved', eta: null, ...item }}
      po={po}
      projectId="proj-1"
      poStatus={(po?.status as string) ?? null}
      showAdvance={false}
      onAdvanced={jest.fn()}
    />,
  );

beforeEach(() => {
  mockDrafts.data = [];
});

describe('MovementCell date requests', () => {
  it("511-R6: a PO line shows its own date request, never its sibling's", () => {
    mockDrafts.data = [
      ASK,
      { ...ASK, id: 'ask-sibling', ffe_item_id: 'line-2', subject: 'Arrival date: Oak bench' },
    ];
    renderCell({ id: 'line-1' }, { id: 'po-1', status: 'ordered', confirmed_eta: null });
    const cell = screen.getByTestId('line-movement-cell');
    expect(within(cell).getAllByTestId('draft-review')).toHaveLength(1);
    expect(within(cell).getByLabelText('Subject')).toHaveValue('Arrival date: Walnut console');
  });

  it('a line with no PO shows the date request it was asked from', () => {
    mockDrafts.data = [{ ...ASK, purchase_order_id: null }];
    renderCell({ id: 'line-1' }, null);
    expect(screen.getAllByTestId('draft-review')).toHaveLength(1);
    expect(screen.queryByText('Date request drafted · no address')).toBeNull();
  });

  it('506-2: no address reads "Date request drafted · no address", Send held with the maker named', () => {
    const land = jest.fn();
    window.addEventListener('document:focus-ffe-line', land);
    mockDrafts.data = [{ ...ASK, purchase_order_id: null, to_email: null }];
    renderCell(
      { id: 'line-1', vendor_name: null, vendor_id: null, product: { brand: 'Fixture Metalworks' } },
      null,
    );
    expect(screen.getByText('Date request drafted · no address')).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(send).toHaveAccessibleDescription('No address on file for Fixture Metalworks.');

    // A brand-only maker has no record to keep an address on: the repair
    // lands on the line's maker selector.
    fireEvent.click(screen.getByRole('button', { name: 'Add an address' }));
    expect(land).toHaveBeenCalledTimes(1);
    expect((land.mock.calls[0][0] as CustomEvent).detail).toEqual({ itemId: 'line-1', cell: 'maker' });
    window.removeEventListener('document:focus-ffe-line', land);
  });

  it('shows no other kind of draft as a date request', () => {
    mockDrafts.data = [{ ...ASK, kind: 'ack_discrepancy_reply', purchase_order_id: null }];
    renderCell({ id: 'line-1' }, null);
    expect(screen.queryByTestId('draft-review')).toBeNull();
  });
});
