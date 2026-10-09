/**
 * T-60j F19: ORDER on a line in a room. The line's row carries its room as the
 * PostgREST join `{id, name}`; the order paper takes a room name, so the unfold
 * hands it the name (an object reached generateSidemark's `.split` and crashed).
 */

import { render } from '@testing-library/react';

const mockOrderPaper = jest.fn();

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('../line-unfold/money-out-cell', () => ({ MoneyOutCell: () => null }));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@patina/supabase', () => ({
  useVendorQuotes: () => ({ data: [] }),
  useUpdateDamageClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdatePurchaseOrderETA: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdatePurchaseOrderStatus: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRecordFfeInstalled: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useVendor: () => ({ data: { id: 'vendor-1', name: 'Winfield Workroom' } }),
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
jest.mock('@/components/portal/procurement/order-paper', () => ({
  OrderPaper: (props: unknown) => {
    mockOrderPaper(props);
    return null;
  },
}));
jest.mock('@/components/portal/procurement/log-inspection-drawer', () => ({
  LogInspectionDrawer: () => null,
}));
jest.mock('@/components/portal/procurement/po-send-actions', () => ({
  clientVendorEmailHint: () => null,
}));
jest.mock('../po-preview', () => ({ PoPreview: () => null, LogAckInline: () => null }));
jest.mock('../accounts/invoice-overlays', () => ({ openInvoiceComposer: jest.fn() }));
jest.mock('../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: [] }),
  useAssignLineRoom: () => ({ mutate: jest.fn() }),
}));

import { LineUnfold } from '../line-unfold';

const item = {
  id: 'line-1',
  name: 'Roman shades, six windows',
  quantity: 6,
  status: 'specified',
  item_type: 'fixed',
  product_id: null,
  unit_price_cents: 65000,
  line_total_cents: 390000,
  trade_price_cents: 41000,
  vendor_id: 'vendor-1',
  vendor_name: 'Winfield Workroom',
  design_disposition: 'selected',
  purchase_order_id: null,
  project_room_id: 'room-living',
};

const paperItems = () =>
  (mockOrderPaper.mock.calls.at(-1)?.[0] as { ffeItems: Array<Record<string, unknown>> })
    .ffeItems;

const renderUnfold = (room: unknown) =>
  render(
    <LineUnfold
      item={{ ...item, room }}
      projectId="project-1"
      projectName="Ellsworth"
      onAddNote={jest.fn()}
      onFold={jest.fn()}
    />,
  );

beforeEach(() => mockOrderPaper.mockReset());

describe('LineUnfold · the order paper’s room (T-60j F19)', () => {
  it('hands the paper the room name, not the {id, name} join', () => {
    renderUnfold({ id: 'room-living', name: 'Living Room' });
    const [line] = paperItems();
    expect(line.room).toBe('Living Room');
    expect(line.id).toBe('line-1');
    expect(line.trade_price_cents).toBe(41000);
  });

  it('hands no room for a line not in a room', () => {
    renderUnfold(null);
    expect(paperItems()[0].room).toBeUndefined();
  });
});
