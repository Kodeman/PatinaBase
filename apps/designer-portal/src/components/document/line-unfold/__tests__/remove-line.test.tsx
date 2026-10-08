import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { LineAuthorization } from '@/lib/document/authorization-derivation';

/**
 * US-21 T-5: the line's own acts. One room label, REMOVE THIS LINE with a
 * reason (refused in place for a released line), and "Something's wrong…"
 * only once the line is ordered.
 */

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

// Money out reads its own payment hooks; its suite is money-out.test.tsx.
jest.mock('../money-out-cell', () => ({ MoneyOutCell: () => null }));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const mockArchive = jest.fn();
const mockArchiveHook = jest.fn(() => ({ mutateAsync: mockArchive, isPending: false }));

jest.mock('@patina/supabase', () => ({
  useArchiveProjectSelection: () => mockArchiveHook(),
  useVendorQuotes: () => ({ data: [] }),
  useUpdateDamageClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdatePurchaseOrderETA: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdatePurchaseOrderStatus: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRecordFfeInstalled: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useVendor: () => ({ data: { id: 'vendor-1', name: 'Hollowell Woodshop' } }),
  useSetFfeLineCommercials: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useFindVendorMatch: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useResolveOrCreateVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useVendors: () => ({ data: { data: [] } }),
  useProductPrices: () => ({ data: undefined }),
  usePoCostLines: () => ({ data: [] }),
  useUpsertPoCostLine: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useStudioIdentity: () => ({ data: undefined }),
  useStudioContacts: () => ({ data: [] }),
  usePoShipments: () => ({ data: [] }),
  useProcurementDrafts: () => ({ data: [] }),
  usePoAcknowledgments: () => ({ data: [] }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useOpenProcurementException: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProcurementItems: () => ({ data: [], isLoading: false }),
  useRecordPoShipment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSampleRequests: () => ({ data: [] }),
  useRecordSampleRequest: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useMarkSampleReturned: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/components/document/buying/com-piece', () => ({ ComPiece: () => null }));
jest.mock('@/components/portal/procurement/order-paper', () => ({ OrderPaper: () => null }));
jest.mock('@/components/portal/procurement/log-inspection-drawer', () => ({
  LogInspectionDrawer: () => null,
}));
jest.mock('@/components/portal/procurement/po-send-actions', () => ({
  clientVendorEmailHint: () => null,
}));
jest.mock('../../po-preview', () => ({ PoPreview: () => null, LogAckInline: () => null }));
jest.mock('../../accounts/invoice-overlays', () => ({ openInvoiceComposer: jest.fn() }));
jest.mock('../../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: [{ id: 'room-1', name: 'Sunroom' }] }),
  useAssignLineRoom: () => ({ mutate: jest.fn() }),
}));

import { LineUnfold } from '../../line-unfold';

const REFUSAL = 'Released lines change through Record a change.';

const item = {
  id: 'line-1',
  name: 'Rattan lounge chair',
  quantity: 2,
  status: 'specified',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 48000,
  line_total_cents: 96000,
  assignment_scope: 'room',
  project_room_id: 'room-1',
  received_quantity: null,
  vendor_id: 'vendor-1',
  vendor_name: 'Hollowell Woodshop',
  design_disposition: 'selected',
  purchase_order_id: null,
};

const authorized: LineAuthorization = {
  track: 'authorized',
  number: 3,
  signedLineTotalCents: 96000,
  depositClear: true,
  deltaCents: null,
};

const renderUnfold = (over: Partial<Parameters<typeof LineUnfold>[0]> = {}) =>
  render(
    <LineUnfold
      item={item}
      projectId="project-1"
      projectName="Ellsworth"
      onAddNote={jest.fn()}
      onFold={jest.fn()}
      {...over}
    />,
  );

const removeAct = () => screen.getByRole('button', { name: 'Remove this line' });

beforeEach(() => {
  mockArchive.mockReset();
  mockArchiveHook.mockClear();
});

describe('LineUnfold · one room label', () => {
  it('names the unassigned choice "Not in a room yet", never "Unsorted"', () => {
    renderUnfold();
    const select = screen.getByRole('combobox', { name: 'Assign to room' });
    expect(within(select).getByRole('option', { name: 'Not in a room yet' })).toHaveValue(
      'unassigned',
    );
    expect(within(select).queryByRole('option', { name: 'Unsorted' })).toBeNull();
  });
});

describe('LineUnfold · REMOVE THIS LINE', () => {
  it('sits in the line act group, and the archive hook waits until asked', () => {
    renderUnfold();
    expect(removeAct()).toHaveAttribute('data-action-key', 'remove-ffe-line');
    expect(removeAct().closest('[role="group"]')).toBe(
      screen.getByRole('button', { name: 'Fold' }).closest('[role="group"]'),
    );
    expect(mockArchiveHook).not.toHaveBeenCalled();
  });

  it('is absent when the selection cannot be edited', () => {
    renderUnfold({ canEditSelection: false });
    expect(screen.queryByRole('button', { name: 'Remove this line' })).toBeNull();
  });

  it('asks for a reason of five characters or more, then archives with it', async () => {
    mockArchive.mockResolvedValue({ selectionId: 'line-1', archived: true });
    renderUnfold();
    fireEvent.click(removeAct());

    const reason = screen.getByRole('textbox', { name: 'Why remove this line' });
    const confirm = screen.getByRole('button', { name: 'Remove' });
    fireEvent.change(reason, { target: { value: ' dup ' } });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(mockArchive).not.toHaveBeenCalled();

    fireEvent.change(reason, { target: { value: '  added twice  ' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mockArchive).toHaveBeenCalledWith({
        selectionId: 'line-1',
        projectId: 'project-1',
        reason: 'added twice',
      }),
    );
  });

  it('"Keep it" closes the ask without archiving', () => {
    renderUnfold();
    fireEvent.click(removeAct());
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByTestId('line-remove-form')).toBeNull();
    expect(mockArchive).not.toHaveBeenCalled();
  });

  it.each([
    ['authorized', { auth: authorized }],
    ['awaiting signature', { auth: { track: 'awaiting', number: 2 } as LineAuthorization }],
    ['on a draft instrument', { auth: { track: 'draft', number: 4 } as LineAuthorization }],
    ['ordered', { item: { ...item, status: 'ordered', purchase_order_id: 'po-1' } }],
  ])('refuses in place for a line %s, naming the door', (_label, over) => {
    renderUnfold(over);
    fireEvent.click(removeAct());
    expect(screen.getByRole('status')).toHaveTextContent(REFUSAL);
    expect(screen.queryByTestId('line-remove-form')).toBeNull();
    expect(mockArchiveHook).not.toHaveBeenCalled();
  });

  it("maps the RPC's authorized-or-ordered refusal to the same sentence", async () => {
    mockArchive.mockRejectedValue({
      code: '23514',
      message: 'authorized or ordered selections must be changed through supersession/PO change',
    });
    renderUnfold();
    fireEvent.click(removeAct());
    fireEvent.change(screen.getByRole('textbox', { name: 'Why remove this line' }), {
      target: { value: 'wrong room entirely' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('status')).toHaveTextContent(REFUSAL);
    expect(screen.queryByTestId('line-remove-form')).toBeNull();
  });

  it('prints any other failure inline and keeps the ask open', async () => {
    mockArchive.mockRejectedValue({ message: 'selection not found' });
    renderUnfold();
    fireEvent.click(removeAct());
    fireEvent.change(screen.getByRole('textbox', { name: 'Why remove this line' }), {
      target: { value: 'added twice' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('selection not found');
    expect(screen.getByTestId('line-remove-form')).toBeInTheDocument();
  });
});

describe("LineUnfold · Something's wrong only after an order", () => {
  it.each(['specified', 'quoted', 'approved'])('is absent on a %s line', (status) => {
    renderUnfold({ item: { ...item, status } });
    expect(screen.queryByRole('button', { name: 'Something’s wrong…' })).toBeNull();
  });

  it.each(['ordered', 'production', 'shipped', 'delivered', 'installed'])(
    'is offered on a %s line',
    (status) => {
      renderUnfold({
        item: { ...item, status, purchase_order_id: 'po-1', purchase_order: { id: 'po-1', status: 'confirmed' } },
      });
      expect(screen.getByRole('button', { name: 'Something’s wrong…' })).toBeInTheDocument();
    },
  );
});
