import { render, screen } from '@testing-library/react';
import type { FulfillmentShipmentRow } from '@patina/fulfillment';
import { ShipmentBoard } from '@/components/fulfillment/shipments/shipment-board';

jest.mock('@/hooks/use-fulfillment-shipments', () => ({
  useConfirmAppointment: jest.fn(() => ({ mutate: jest.fn(), isPending: false, isError: false })),
  useUploadShipmentPod: jest.fn(() => ({ mutate: jest.fn(), isPending: false, isError: false })),
  useDeliverShipment: jest.fn(() => ({ mutate: jest.fn(), isPending: false, isError: false })),
  useRecordEtaChange: jest.fn(() => ({ mutate: jest.fn(), isPending: false, isError: false })),
}));

const NOW = Date.UTC(2026, 8, 1);

function row(overrides: Partial<FulfillmentShipmentRow>): FulfillmentShipmentRow {
  return {
    id: 'ship',
    poId: 'po',
    poNumber: 'PO-2026-00001-A',
    orderId: 'order',
    orderNo: 1,
    clientName: 'Client',
    vendorId: 'vendor',
    vendorName: 'Vendor',
    mode: 'parcel',
    carrier: 'UPS',
    tracking: '1Z1',
    appointmentConfirmedAt: null,
    shippedAt: '2026-08-20T00:00:00Z',
    deliveredAt: null,
    podR2Key: null,
    inspectionWindowDays: 5,
    inspectionClosesAt: null,
    currentEta: null,
    committedShip: null,
    etaHistory: [],
    itemNames: ['Item'],
    ...overrides,
  };
}

describe('ShipmentBoard', () => {
  it('renders an EmptyState with no shipments', () => {
    render(<ShipmentBoard rows={[]} nowMs={NOW} />);
    expect(screen.getByText(/no shipments recorded yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('shipment-board')).not.toBeInTheDocument();
  });

  it('pins the open-inspection-window row above rows sorted by ETA', () => {
    const rows: FulfillmentShipmentRow[] = [
      row({ id: 'late', currentEta: '2026-09-20', committedShip: '2026-09-10' }),
      row({
        id: 'window',
        deliveredAt: '2026-08-30T00:00:00Z',
        inspectionClosesAt: new Date(NOW + 2 * 86_400_000).toISOString(),
      }),
      row({ id: 'soon', currentEta: '2026-09-05', committedShip: '2026-09-05' }),
    ];
    render(<ShipmentBoard rows={rows} nowMs={NOW} />);
    const ids = screen.getAllByTestId('shipment-row').map((el) => el.getAttribute('data-shipment-id'));
    expect(ids).toEqual(['window', 'soon', 'late']);
  });
});
