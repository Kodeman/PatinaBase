/**
 * C-26 shipments in the Movement cell: a part shipment's record_po_shipment
 * args (mode, carrier, tracking, lines and quantities), deliveries per
 * shipment, and the Week placing a delivery on the current ETA.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockRecord = jest.fn();
const mockShipments: { data: unknown[] } = { data: [] };
const mockItems = [
  { id: 'line-sofa', name: 'Halden Sofa', quantity: 1, purchase_order_id: 'po-1' },
  { id: 'line-chair', name: 'Lawson Chair', quantity: 4, purchase_order_id: 'po-1' },
];

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useQuery: () => ({ data: undefined, isLoading: false }),
}));
jest.mock('@patina/supabase', () => ({
  usePoShipments: () => ({ data: mockShipments.data }),
  useProcurementItems: () => ({ data: mockItems, isLoading: false }),
  useRecordPoShipment: () => ({ mutateAsync: mockRecord, isPending: false }),
  createBrowserClient: () => ({}),
}));
jest.mock('@/hooks/use-folio', () => ({
  useUploadFolioFile: () => ({ mutateAsync: jest.fn(), isPending: false }),
  folioSignedUrl: jest.fn(),
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/lib/document/format', () => ({
  ...jest.requireActual('@/lib/document/format'),
  todayYmd: () => '2026-10-06',
}));

import { weekEta } from '../../orders-book-week';
import {
  PoShipments,
  freshShipment,
  remainingQty,
  shipmentRequest,
} from '../shipments';

const shipment = (over: Record<string, unknown> = {}) => ({
  id: 'ship-1',
  purchase_order_id: 'po-1',
  mode: 'ltl',
  carrier: 'Estes',
  tracking: '4471-0091',
  bol_document_path: null,
  shipped_on: '2026-10-02',
  delivered_on: null,
  current_eta: '2026-10-09',
  eta_history: [],
  inspection_closes_at: null,
  po_shipment_lines: [{ shipment_id: 'ship-1', ffe_item_id: 'line-chair', qty: 2 }],
  ...over,
});

beforeEach(() => {
  mockRecord.mockReset().mockResolvedValue({ purchase_order_id: 'po-1' });
  mockShipments.data = [];
});

describe('partial shipments', () => {
  it('a new shipment carries what is left of each piece', () => {
    const shipped = [shipment()] as never[];
    expect(remainingQty(mockItems[1], shipped)).toBe(2);
    expect(remainingQty(mockItems[0], shipped)).toBe(1);
    expect(freshShipment(mockItems, shipped, '2026-10-06').qty).toEqual({
      'line-sofa': '1',
      'line-chair': '2',
    });
  });

  it('sends only the pieces that travel, with whole quantities', () => {
    const draft = {
      mode: 'white_glove' as const,
      carrier: ' Hale truck ',
      tracking: '',
      shippedOn: '2026-10-06',
      currentEta: '2026-10-12',
      qty: { 'line-sofa': '0', 'line-chair': '3' },
    };
    expect(shipmentRequest(draft, 'folio/bol.pdf')).toEqual({
      mode: 'white_glove',
      carrier: 'Hale truck',
      shippedOn: '2026-10-06',
      currentEta: '2026-10-12',
      bolDocumentPath: 'folio/bol.pdf',
      lines: [{ ffeItemId: 'line-chair', qty: 3 }],
    });
    expect(shipmentRequest({ ...draft, qty: { 'line-chair': '1.5' } })).toBeNull();
    expect(shipmentRequest({ ...draft, qty: { 'line-chair': '' } })).toBeNull();
  });

  it('records a part shipment from the Movement cell', async () => {
    render(<PoShipments poId="po-1" itemId="line-sofa" projectId="project-1" poStatus="in_production" />);
    fireEvent.click(screen.getByRole('button', { name: 'Record a shipment' }));
    const form = screen.getByTestId('record-shipment-form');
    fireEvent.change(within(form).getByRole('combobox', { name: 'Shipment mode' }), {
      target: { value: 'ltl' },
    });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Shipment carrier' }), {
      target: { value: 'Estes' },
    });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Shipment tracking' }), {
      target: { value: '4471-0091' },
    });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Lawson Chair pieces shipped' }), {
      target: { value: '2' },
    });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Halden Sofa pieces shipped' }), {
      target: { value: '' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save as shipped' }));
    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
    expect(mockRecord).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      projectId: 'project-1',
      localDate: '2026-10-06',
      request: {
        mode: 'ltl',
        carrier: 'Estes',
        tracking: '4471-0091',
        shippedOn: '2026-10-06',
        lines: [{ ffeItemId: 'line-chair', qty: 2 }],
      },
    });
  });

  it('marks one shipment delivered, by its id', async () => {
    mockShipments.data = [shipment()];
    render(<PoShipments poId="po-1" itemId="line-chair" projectId="project-1" poStatus="shipped" />);
    expect(screen.getByText(/Shipped .* · LTL · Estes/)).toBeInTheDocument();
    expect(screen.getByText('Lawson Chair ×2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark delivered' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save as delivered' }));
    await waitFor(() =>
      expect(mockRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          purchaseOrderId: 'po-1',
          request: { id: 'ship-1', deliveredOn: '2026-10-06' },
        }),
      ),
    );
  });

  it('offers no shipment on a draft PO', () => {
    render(<PoShipments poId="po-1" itemId="line-sofa" projectId="project-1" poStatus="draft" />);
    expect(screen.queryByRole('button', { name: /Record a shipment/ })).toBeNull();
  });
});

describe('the Week reads current_eta', () => {
  const event = (over: Record<string, unknown>) =>
    ({
      event_id: 'po-1',
      project_id: 'project-1',
      project_name: 'Kochaver',
      purchase_order_id: 'po-1',
      vendor_id: 'vendor-1',
      vendor_name: 'Hale',
      event_date: '2026-10-14',
      event_type: 'delivery_expected',
      po_status: 'shipped',
      delivered_date: null,
      ffe_item_count: 1,
      line_total_cents: 100,
      inspection_id: null,
      inspection_outcome: null,
      phase_key: null,
      ...over,
    }) as never;

  it('places a delivery on the shipment ETA when there is one', () => {
    expect(weekEta(event({ current_eta: '2026-10-21', confirmed_eta: '2026-10-14' }))).toBe(
      '2026-10-21',
    );
  });

  it('falls back to the confirmed ETA, then the event date', () => {
    expect(weekEta(event({ current_eta: null, confirmed_eta: '2026-10-14' }))).toBe('2026-10-14');
    expect(weekEta(event({ event_type: 'install_milestone', event_date: '2026-11-02T00:00:00' }))).toBe(
      '2026-11-02',
    );
    expect(weekEta(event({ event_date: null }))).toBeNull();
  });
});
