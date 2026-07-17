import { render, screen, fireEvent } from '@testing-library/react';
import type { FulfillmentShipmentRow } from '@patina/fulfillment';
import { ShipmentRow } from '@/components/fulfillment/shipments/shipment-row';

// Mirrors note-drawer.test.tsx's pattern: mock the mutation hooks (this suite
// proves the ROW wires @patina/fulfillment's pure gate/slip/countdown logic
// to the DOM correctly — the arithmetic itself is exhaustively unit-tested in
// packages/fulfillment/src/__tests__/shipments.test.ts), keep everything else
// real.
const mockConfirmMutate = jest.fn();
const mockUploadMutate = jest.fn();
const mockDeliverMutate = jest.fn();
const mockRecordEtaChangeMutate = jest.fn();

jest.mock('@/hooks/use-fulfillment-shipments', () => ({
  useConfirmAppointment: jest.fn(() => ({ mutate: mockConfirmMutate, isPending: false, isError: false })),
  useUploadShipmentPod: jest.fn(() => ({ mutate: mockUploadMutate, isPending: false, isError: false })),
  useDeliverShipment: jest.fn(() => ({ mutate: mockDeliverMutate, isPending: false, isError: false })),
  useRecordEtaChange: jest.fn(() => ({
    mutate: mockRecordEtaChangeMutate,
    isPending: false,
    isError: false,
  })),
}));

const NOW = Date.UTC(2026, 8, 1); // 2026-09-01T00:00:00Z

function makeRow(overrides: Partial<FulfillmentShipmentRow> = {}): FulfillmentShipmentRow {
  return {
    id: 'ship-1',
    poId: 'po-1',
    poNumber: 'PO-2026-00001-A',
    orderId: 'order-1',
    orderNo: 1,
    clientName: 'Priya Anand',
    vendorId: 'vendor-1',
    vendorName: 'Room & Board',
    mode: 'parcel',
    carrier: 'UPS',
    tracking: '1Z999AA10123456784',
    appointmentConfirmedAt: null,
    shippedAt: '2026-08-20T00:00:00Z',
    deliveredAt: null,
    podR2Key: null,
    inspectionWindowDays: 5,
    inspectionClosesAt: null,
    currentEta: null,
    committedShip: '2026-09-03',
    etaHistory: [],
    itemNames: ['Walnut Credenza'],
    ...overrides,
  };
}

describe('ShipmentRow', () => {
  beforeEach(() => jest.clearAllMocks());

  it('leads with a ModeChip carrying the mode', () => {
    render(<ShipmentRow row={makeRow({ mode: 'parcel' })} nowMs={NOW} />);
    const chip = screen.getByTestId('mode-chip');
    expect(chip).toHaveAttribute('data-mode', 'parcel');
    expect(chip).toHaveTextContent('Parcel');
  });

  it('renders client, item summary, and PO number in the row', () => {
    render(<ShipmentRow row={makeRow()} nowMs={NOW} />);
    expect(screen.getByTestId('shipment-client-name')).toHaveTextContent('Priya Anand');
    expect(screen.getByTestId('shipment-item-summary')).toHaveTextContent('Walnut Credenza');
    expect(screen.getByTestId('shipment-po-number')).toHaveTextContent('PO-2026-00001-A');
  });

  it('renders carrier + tracking in mono', () => {
    render(<ShipmentRow row={makeRow()} nowMs={NOW} />);
    expect(screen.getByTestId('shipment-carrier-tracking')).toHaveTextContent(
      'UPS · 1Z999AA10123456784',
    );
  });

  it('renders the slip figure with a terracotta delta when the current ETA has slipped', () => {
    render(
      <ShipmentRow
        row={makeRow({ committedShip: '2026-09-03', currentEta: '2026-09-10' })}
        nowMs={NOW}
      />,
    );
    const slip = screen.getByTestId('shipment-slip-value');
    expect(slip).toHaveTextContent('SEP 10 · +7');
    expect(slip).toHaveAttribute('data-slipped', 'true');
  });

  it('renders the slip figure without a delta when on schedule', () => {
    render(
      <ShipmentRow
        row={makeRow({ committedShip: '2026-09-03', currentEta: '2026-09-03' })}
        nowMs={NOW}
      />,
    );
    const slip = screen.getByTestId('shipment-slip-value');
    expect(slip).toHaveTextContent('SEP 3');
    expect(slip).toHaveAttribute('data-slipped', 'false');
  });

  it('does not render a DeadlineClock on a row with no open inspection window', () => {
    render(<ShipmentRow row={makeRow({ deliveredAt: null })} nowMs={NOW} />);
    expect(screen.queryByTestId('deadline-clock')).not.toBeInTheDocument();
  });

  it('renders the loudest-on-board DeadlineClock on a delivered row with an open window', () => {
    const closesAt = new Date(NOW + 2 * 86_400_000).toISOString();
    render(
      <ShipmentRow
        row={makeRow({ deliveredAt: '2026-08-30T00:00:00Z', inspectionClosesAt: closesAt })}
        nowMs={NOW}
      />,
    );
    const clock = screen.getByTestId('deadline-clock');
    expect(clock).toHaveAttribute('data-open', 'true');
    expect(clock).toHaveAttribute('data-terracotta', 'true'); // <= 2 days
    const value = screen.getByTestId('deadline-clock-value');
    expect(value).toHaveTextContent('2 DAYS');
    expect(value.className).toContain('deadline-clock-loud');
  });

  it('blocks Deliver and Upload POD for an LTL shipment with no confirmed appointment, with a visible reason', () => {
    render(<ShipmentRow row={makeRow({ mode: 'ltl', appointmentConfirmedAt: null })} nowMs={NOW} />);
    expect(screen.getByTestId('shipment-deliver-button')).toBeDisabled();
    expect(screen.getByTestId('shipment-upload-pod')).toBeDisabled();
    expect(screen.getByTestId('shipment-deliver-blocked-reason')).toHaveTextContent(
      /confirmed delivery appointment/i,
    );
    expect(screen.getByTestId('shipment-confirm-appointment')).toBeInTheDocument();
  });

  it('enables Deliver and Upload POD once an LTL shipment has a confirmed appointment', () => {
    render(
      <ShipmentRow
        row={makeRow({ mode: 'ltl', appointmentConfirmedAt: '2026-08-25T00:00:00Z' })}
        nowMs={NOW}
      />,
    );
    expect(screen.getByTestId('shipment-deliver-button')).toBeEnabled();
    expect(screen.getByTestId('shipment-upload-pod')).toBeEnabled();
    expect(screen.queryByTestId('shipment-confirm-appointment')).not.toBeInTheDocument();
  });

  it('never blocks a parcel shipment on the appointment gate', () => {
    render(<ShipmentRow row={makeRow({ mode: 'parcel', appointmentConfirmedAt: null })} nowMs={NOW} />);
    expect(screen.getByTestId('shipment-deliver-button')).toBeEnabled();
    expect(screen.getByTestId('shipment-upload-pod')).toBeEnabled();
    expect(screen.queryByTestId('shipment-confirm-appointment')).not.toBeInTheDocument();
  });

  it('hides the delivery actions once a shipment is already delivered', () => {
    render(
      <ShipmentRow
        row={makeRow({ deliveredAt: '2026-08-30T00:00:00Z', inspectionClosesAt: null })}
        nowMs={NOW}
      />,
    );
    expect(screen.queryByTestId('shipment-deliver-actions')).not.toBeInTheDocument();
    expect(screen.getByTestId('shipment-status')).toHaveTextContent('Delivered');
  });

  it('calling the Confirm Appointment button invokes the mutation', () => {
    render(<ShipmentRow row={makeRow({ mode: 'white_glove', appointmentConfirmedAt: null })} nowMs={NOW} />);
    screen.getByTestId('shipment-confirm-appointment').click();
    expect(mockConfirmMutate).toHaveBeenCalledTimes(1);
  });

  it('clicking Mark delivered invokes the deliver mutation when the gate is open', () => {
    render(<ShipmentRow row={makeRow({ mode: 'parcel' })} nowMs={NOW} />);
    screen.getByTestId('shipment-deliver-button').click();
    expect(mockDeliverMutate).toHaveBeenCalledTimes(1);
  });

  // ── R4.5 — Record ETA change (BOH-DECISIONS) ──────────────────────────────

  it('renders the Record ETA change affordance on a non-delivered row', () => {
    render(<ShipmentRow row={makeRow({ deliveredAt: null })} nowMs={NOW} />);
    expect(screen.getByTestId('shipment-record-eta-change')).toBeInTheDocument();
  });

  it('hides Record ETA change once a shipment is already delivered', () => {
    render(
      <ShipmentRow
        row={makeRow({ deliveredAt: '2026-08-30T00:00:00Z', inspectionClosesAt: null })}
        nowMs={NOW}
      />,
    );
    expect(screen.queryByTestId('shipment-record-eta-change')).not.toBeInTheDocument();
  });

  it('opens the ETA change dialog, pre-filled from the current slip, on click', () => {
    render(
      <ShipmentRow
        row={makeRow({ committedShip: '2026-09-03', currentEta: '2026-09-10' })}
        nowMs={NOW}
      />,
    );
    expect(screen.queryByTestId('eta-change-dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('shipment-record-eta-change'));

    expect(screen.getByTestId('eta-change-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('eta-change-date')).toHaveValue('2026-09-10');
    // reason is required and starts empty — submit stays disabled until typed
    expect(screen.getByTestId('eta-change-submit')).toBeDisabled();
  });

  it('closes the ETA change dialog on Cancel without mutating', () => {
    render(<ShipmentRow row={makeRow()} nowMs={NOW} />);
    fireEvent.click(screen.getByTestId('shipment-record-eta-change'));
    expect(screen.getByTestId('eta-change-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('eta-change-cancel'));

    expect(screen.queryByTestId('eta-change-dialog')).not.toBeInTheDocument();
    expect(mockRecordEtaChangeMutate).not.toHaveBeenCalled();
  });
});
