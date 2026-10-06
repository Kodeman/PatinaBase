import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

// Money out reads its own payment hooks; its suite is line-unfold/__tests__.
jest.mock('../line-unfold/money-out-cell', () => ({ MoneyOutCell: () => null }));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const mockSetCommercials = jest.fn();
const mockFindVendorMatch = jest.fn();
const mockResolveOrCreateVendor = jest.fn();
let mockVendors: { id: string; name: string }[] = [];
let mockProductPrices: Map<string, { price_retail: number | null; price_trade: number | null }> | undefined;

jest.mock('@patina/supabase', () => ({
  useVendorQuotes: () => ({ data: [] }),
  useUpdateDamageClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdatePurchaseOrderETA: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdatePurchaseOrderStatus: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRecordFfeInstalled: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useVendor: () => ({ data: { id: 'vendor-1', name: 'Winfield Workroom' } }),
  useSetFfeLineCommercials: () => ({ mutateAsync: mockSetCommercials, isPending: false }),
  useFindVendorMatch: () => ({ mutateAsync: mockFindVendorMatch, isPending: false }),
  useResolveOrCreateVendor: () => ({ mutateAsync: mockResolveOrCreateVendor, isPending: false }),
  useVendors: (filters?: { search?: string }) => ({
    data: {
      data: filters?.search
        ? mockVendors.filter((v) =>
            v.name.toLowerCase().includes(filters.search!.toLowerCase()),
          )
        : mockVendors,
    },
  }),
  useProductPrices: () => ({ data: mockProductPrices }),
  // C-26 riders and shipments (riders.test.tsx, shipments.test.tsx).
  usePoCostLines: () => ({ data: [] }),
  useUpsertPoCostLine: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useStudioIdentity: () => ({ data: undefined }),
  useStudioContacts: () => ({ data: [] }),
  usePoShipments: () => ({ data: [] }),
  useProcurementDrafts: () => ({ data: [] }),
  // C-27: no acknowledgment yet; the check's own suite is ack-check.test.tsx.
  usePoAcknowledgments: () => ({ data: [] }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useOpenProcurementException: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProcurementItems: () => ({ data: [], isLoading: false }),
  useRecordPoShipment: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

// C-24: the pair, COM facts and submittals are com-piece.test.tsx's.
jest.mock('@/components/document/buying/com-piece', () => ({ ComPiece: () => null }));
jest.mock('@/components/portal/procurement/order-paper', () => ({
  OrderPaper: () => null,
}));
jest.mock('@/components/portal/procurement/log-inspection-drawer', () => ({
  LogInspectionDrawer: () => null,
}));
jest.mock('@/components/portal/procurement/po-send-actions', () => ({
  clientVendorEmailHint: () => null,
}));
jest.mock('../po-preview', () => ({
  PoPreview: () => null,
  LogAckInline: () => null,
}));
jest.mock('../accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
}));
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
};

const renderUnfold = (
  over: Record<string, unknown> = {},
  props: Partial<Parameters<typeof LineUnfold>[0]> = {},
) =>
  render(
    <LineUnfold
      item={{ ...item, ...over }}
      projectId="project-1"
      projectName="Ellsworth"
      onAddNote={jest.fn()}
      onFold={jest.fn()}
      {...props}
    />,
  );

const block = () => within(screen.getByTestId('line-commercials'));
const WARNING = 'Trade cost matches retail. Confirm the studio’s cost with the maker.';

beforeEach(() => {
  mockSetCommercials.mockReset().mockResolvedValue({});
  mockFindVendorMatch.mockReset();
  mockResolveOrCreateVendor.mockReset();
  mockVendors = [];
  mockProductPrices = undefined;
});

describe('LineUnfold · C-05 line commercials', () => {
  it('is editable on a line not yet on a purchase order', () => {
    renderUnfold();
    expect(block().getByLabelText('Trade cost')).toHaveValue('410');
    expect(block().getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(block().getByText('Winfield Workroom')).toBeInTheDocument();
    expect(block().queryByText(/^On /)).not.toBeInTheDocument();
  });

  it('is read-only with "On PO-xxxx" once the line is on a purchase order', () => {
    renderUnfold({
      status: 'ordered',
      purchase_order_id: 'po-1',
      purchase_order: { id: 'po-1', status: 'sent', po_number: 'PO-0042', vendor_id: 'vendor-1' },
    });
    expect(block().queryByLabelText('Trade cost')).not.toBeInTheDocument();
    expect(block().queryByRole('combobox')).not.toBeInTheDocument();
    expect(block().queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    expect(block().getByText('On PO-0042')).toBeInTheDocument();
    expect(screen.getByTestId('line-commercials')).toHaveTextContent('Maker Winfield Workroom');
    expect(screen.getByTestId('line-commercials')).toHaveTextContent('Trade cost $410');
  });

  it('is read-only when purchase_order_id is set and the PO embed is absent', () => {
    renderUnfold({ status: 'ordered', purchase_order_id: 'po-1', purchase_order: undefined });
    expect(block().queryByLabelText('Trade cost')).not.toBeInTheDocument();
    expect(block().queryByRole('combobox')).not.toBeInTheDocument();
    expect(block().queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    expect(block().getByText('On a purchase order')).toBeInTheDocument();
    expect(screen.getByTestId('line-commercials')).toHaveTextContent('Trade cost $410');
  });

  it('is read-only for a viewer who cannot edit the selection', () => {
    renderUnfold({}, { canEditSelection: false });
    expect(block().queryByLabelText('Trade cost')).not.toBeInTheDocument();
    expect(block().queryByText(/^On /)).not.toBeInTheDocument();
  });

  it('saves the trade cost in cents through set_project_ffe_line_commercials', async () => {
    renderUnfold();
    const input = block().getByLabelText('Trade cost');
    fireEvent.change(input, { target: { value: '$1,234.50' } });
    fireEvent.blur(input);
    expect(mockSetCommercials).toHaveBeenCalledWith({
      itemId: 'line-1',
      projectId: 'project-1',
      tradePriceCents: 123450,
    });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('does not call the RPC when the trade cost is unchanged or not a number', () => {
    renderUnfold();
    const input = block().getByLabelText('Trade cost');
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: 'twelve' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockSetCommercials).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/trade cost in dollars/i);
  });

  it('shows the refusal inline when the save fails', async () => {
    mockSetCommercials.mockRejectedValue(new Error('line is on a purchase order'));
    renderUnfold();
    const input = block().getByLabelText('Trade cost');
    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByRole('alert')).toHaveTextContent('line is on a purchase order');
  });

  it('picks an existing maker and sends only the vendor id', async () => {
    mockVendors = [{ id: 'vendor-2', name: 'Hollowell Woodshop' }];
    renderUnfold({ vendor_id: null, vendor_name: null });
    fireEvent.change(block().getByRole('combobox', { name: 'Maker' }), {
      target: { value: 'hollow' },
    });
    fireEvent.click(block().getByRole('option', { name: 'Hollowell Woodshop' }));
    await waitFor(() =>
      expect(mockSetCommercials).toHaveBeenCalledWith({
        itemId: 'line-1',
        projectId: 'project-1',
        vendorId: 'vendor-2',
      }),
    );
    expect(mockFindVendorMatch).not.toHaveBeenCalled();
  });

  it('adds a new maker inline — resolving first — then attaches it to the line', async () => {
    mockFindVendorMatch.mockResolvedValue(null);
    mockResolveOrCreateVendor.mockResolvedValue('vendor-new');
    renderUnfold({ vendor_id: null, vendor_name: null });
    fireEvent.change(block().getByRole('combobox', { name: 'Maker' }), {
      target: { value: 'Ostrander Upholstery' },
    });
    fireEvent.click(
      block().getByRole('option', { name: 'Add a maker: “Ostrander Upholstery”' }),
    );
    expect(mockFindVendorMatch).toHaveBeenCalledWith({ name: 'Ostrander Upholstery' });
    await waitFor(() =>
      expect(mockSetCommercials).toHaveBeenCalledWith({
        itemId: 'line-1',
        projectId: 'project-1',
        vendorId: 'vendor-new',
      }),
    );
    expect(mockResolveOrCreateVendor).toHaveBeenCalledWith({ name: 'Ostrander Upholstery' });
  });

  it('offers the maker already in Patina instead of creating one (R-PB4)', async () => {
    mockFindVendorMatch.mockResolvedValue({ id: 'vendor-hewn', name: 'Hewn Woodworks' });
    renderUnfold({ vendor_id: null, vendor_name: null });
    fireEvent.change(block().getByRole('combobox', { name: 'Maker' }), {
      target: { value: 'hewn woodworks' },
    });
    fireEvent.click(block().getByRole('option', { name: 'Add a maker: “hewn woodworks”' }));
    expect(await block().findByText('Hewn Woodworks is already in Patina.')).toBeInTheDocument();
    expect(mockSetCommercials).not.toHaveBeenCalled();
    expect(mockResolveOrCreateVendor).not.toHaveBeenCalled();
    fireEvent.click(block().getByRole('button', { name: 'Use it' }));
    await waitFor(() =>
      expect(mockSetCommercials).toHaveBeenCalledWith({
        itemId: 'line-1',
        projectId: 'project-1',
        vendorId: 'vendor-hewn',
      }),
    );
    expect(mockResolveOrCreateVendor).not.toHaveBeenCalled();
  });

  it('warns, without blocking, when trade equals retail on an off-catalog line', () => {
    renderUnfold({ trade_price_cents: 65000 });
    expect(screen.getByText(WARNING)).toBeInTheDocument();
    expect(block().getByLabelText('Trade cost')).toBeEnabled();
  });

  it('warns when the product has no trade price of its own', () => {
    mockProductPrices = new Map([['product-1', { price_retail: 65000, price_trade: null }]]);
    renderUnfold({ product_id: 'product-1', trade_price_cents: 65000 });
    expect(screen.getByText(WARNING)).toBeInTheDocument();
  });

  it('stays quiet for a catalog product with its own trade price', () => {
    mockProductPrices = new Map([['product-1', { price_retail: 65000, price_trade: 65000 }]]);
    renderUnfold({ product_id: 'product-1', trade_price_cents: 65000 });
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });

  it('stays quiet when trade differs from retail', () => {
    renderUnfold();
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });

  it('never renders a client price or markup input', () => {
    renderUnfold();
    const inputs = within(screen.getByTestId('line-commercials')).queryAllByRole('textbox');
    expect(inputs.map((el) => el.getAttribute('aria-label'))).toEqual(['Trade cost']);
    expect(screen.queryByLabelText(/client price|retail|markup|unit price/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('line-commercials')).not.toHaveTextContent('$650');
  });
});
