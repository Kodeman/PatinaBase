import { render, screen, within } from '@testing-library/react';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
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
  // Money out (C-11): the full schedule is still loading, so the line's
  // embed stands in; its own suite is money-out.test.tsx.
  usePOPayments: () => ({ data: undefined }),
  useVendorPayments: () => ({ data: [] }),
  useStudioPaymentMethods: () => ({ data: [] }),
  useFfeInvoiceCoverage: () => ({ data: undefined }),
  // C-31: the Money cell's staged fact; its own suite is money-out.test.tsx.
  useFfeInvoiceStageCoverage: () => ({ data: undefined }),
  useProjectInvoices: () => ({ data: undefined }),
  useStartPoCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUser: () => ({ user: null }),
  usePurchaseOrders: () => ({ data: undefined }),
  // C-26: riders (Order cell) and shipments (Movement cell); their own suites
  // are riders.test.tsx and shipments.test.tsx.
  usePoCostLines: () => ({ data: [] }),
  useUpsertPoCostLine: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useStudioIdentity: () => ({ data: undefined }),
  useStudioContacts: () => ({ data: [] }),
  usePoShipments: () => ({ data: [] }),
  // C-28 drafts ride in the cells; their own suite is draft-review.test.tsx.
  useProcurementDrafts: () => ({ data: [] }),
  // C-27: no acknowledgment yet; the check's own suite is ack-check.test.tsx.
  usePoAcknowledgments: () => ({ data: [] }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useOpenProcurementException: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProcurementItems: () => ({ data: [], isLoading: false }),
  useRecordPoShipment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  // C-29: the Quote cell; its own suite is quote.test.tsx.
  useVendorQuotes: () => ({ data: [] }),
  // C-35: samples on the line; their own suite is sample-request.test.tsx.
  useSampleRequests: () => ({ data: [] }),
  useRecordSampleRequest: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useMarkSampleReturned: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

// C-20: the clock's sentence is receiving-claim-clock.test.tsx's; here it
// only marks where it rides.
jest.mock('../claim-clock', () => ({
  ClaimClockLine: ({ purchaseOrderId }: { purchaseOrderId: string }) => (
    <p data-testid="claim-clock">{purchaseOrderId}</p>
  ),
}));

jest.mock('@/components/portal/procurement/order-paper', () => ({
  OrderPaper: () => null,
}));
// C-24: the pair, COM facts and submittals are com-piece.test.tsx's.
jest.mock('@/components/document/buying/com-piece', () => ({
  ComPiece: () => <div data-testid="com-piece" />,
}));
jest.mock('@/components/portal/procurement/log-inspection-drawer', () => ({
  LogInspectionDrawer: () => null,
}));
jest.mock('@/components/portal/procurement/po-send-actions', () => ({
  clientVendorEmailHint: () => null,
}));
jest.mock('../../po-preview', () => ({
  PoPreview: () => null,
  LogAckInline: () => <div data-testid="log-ack-inline" />,
}));
jest.mock('../../accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
}));
jest.mock('../../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({ data: [] }),
  useAssignLineRoom: () => ({ mutate: jest.fn() }),
}));

import { LineUnfold } from '../../line-unfold';

const item = {
  id: 'line-1',
  name: 'Halden Sofa',
  quantity: 1,
  status: 'specified',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 648000,
  trade_price_cents: 432000,
  line_total_cents: 648000,
  received_quantity: null,
  vendor_id: 'vendor-1',
  vendor_name: 'Hale Upholstery Works',
  design_disposition: 'selected',
  purchase_order_id: null,
  spec: {
    configuration_snapshot: {
      selections: [
        { groupName: 'Wood', valueLabel: 'Ebonized oak' },
        { groupName: 'Fabric', valueLabel: 'Kessler Brae linen' },
      ],
    },
  },
};

const po = {
  id: 'po-1042',
  po_number: 'PO-1042',
  status: 'in_production',
  vendor_id: 'vendor-1',
  sent_at: '2026-10-07T12:00:00Z',
  acknowledged_at: '2026-10-09T12:00:00Z',
  confirmed_eta: null,
  ship_to: 'Cedar Lake Receiving & Storage',
  payments: [
    { kind: 'deposit', state: 'paid', due_date: null, paid_date: '2026-10-08' },
    { kind: 'balance', state: 'due', due_date: '2026-10-30', paid_date: null },
  ],
};

const renderUnfold = (over: Record<string, unknown> = {}) =>
  render(
    <LineUnfold
      item={{ ...item, ...over }}
      projectId="project-1"
      projectName="Ellsworth"
      onAddNote={jest.fn()}
      onFold={jest.fn()}
    />,
  );

const CELLS = ['The buy', 'Quote', 'Order', 'Movement', 'Money out', 'Receiving'];

describe('LineUnfold · six cells (C-14)', () => {
  it('renders the six cells in order', () => {
    renderUnfold();
    const names = screen
      .getAllByRole('group')
      .map((g) => g.getAttribute('aria-label'))
      .filter((name) => CELLS.includes(name ?? ''));
    expect(names).toEqual(CELLS);
  });

  it('carries the maker, trade cost and spec facts in The buy', () => {
    renderUnfold();
    const buy = within(screen.getByRole('group', { name: 'The buy' }));
    expect(buy.getByTestId('line-commercials')).toBeInTheDocument();
    expect(buy.getByLabelText('Trade cost')).toHaveValue('4320');
    expect(
      buy.getByText('Ebonized oak · Kessler Brae linen · ×1'),
    ).toBeInTheDocument();
  });

  it('keeps the Quote cell present and quiet', () => {
    renderUnfold();
    expect(screen.getByRole('group', { name: 'Quote' })).toHaveTextContent(
      'No quote recorded',
    );
  });

  it('reads the Order cell: PO number, send and ack, ship-to', () => {
    renderUnfold({ status: 'production', purchase_order_id: po.id, purchase_order: po });
    const order = screen.getByRole('group', { name: 'Order' });
    expect(order).toHaveTextContent('PO-1042');
    expect(order).toHaveTextContent('acknowledged');
    expect(order).toHaveTextContent('ship to Cedar Lake Receiving & Storage');
  });

  it('offers "Change this order…" in the Order cell on a live PO only (C-21)', () => {
    const { unmount } = renderUnfold({
      status: 'production',
      purchase_order_id: po.id,
      purchase_order: po,
    });
    expect(
      within(screen.getByRole('group', { name: 'Order' })).getByRole('button', {
        name: 'Change this order…',
      }),
    ).toBeInTheDocument();
    unmount();

    renderUnfold({
      status: 'production',
      purchase_order_id: po.id,
      purchase_order: { ...po, status: 'cancelled' },
    });
    expect(
      screen.queryByRole('button', { name: 'Change this order…' }),
    ).not.toBeInTheDocument();
  });

  it('puts the readiness reasons in the Order cell when Order is held back', () => {
    renderUnfold({ vendor_id: null });
    const order = screen.getByRole('group', { name: 'Order' });
    expect(within(order).getByTestId('line-order-readiness')).toHaveTextContent(
      'Needs a maker',
    );
    expect(screen.queryByTestId('line-next-act')).not.toBeInTheDocument();
  });

  it('lists the PO payments in Money out, one row each', () => {
    renderUnfold({ status: 'production', purchase_order_id: po.id, purchase_order: po });
    const rows = within(screen.getByRole('group', { name: 'Money out' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^Deposit · paid /),
      expect.stringMatching(/^Balance · due /),
    ]);
  });

  it('says so honestly when a PO has no payments recorded', () => {
    renderUnfold({
      status: 'production',
      purchase_order_id: po.id,
      purchase_order: { ...po, payments: [] },
    });
    expect(screen.getByRole('group', { name: 'Money out' })).toHaveTextContent(
      'No payments recorded',
    );
  });

  it('reads a maker-lane order read-only: settles through checkout (V1)', () => {
    renderUnfold({
      status: 'production',
      purchase_order_id: po.id,
      purchase_order: { ...po, is_patina_catalog: true },
    });
    const money = screen.getByRole('group', { name: 'Money out' });
    expect(money).toHaveTextContent('Settles through Patina checkout');
    expect(
      within(money).queryByRole('button', { name: /Record payment/ }),
    ).not.toBeInTheDocument();
  });

  it('keeps the receiving facts in Receiving', () => {
    renderUnfold({ status: 'delivered' });
    expect(screen.getByRole('group', { name: 'Receiving' })).toHaveTextContent(
      'Awaiting inspection',
    );
  });

  it('carries the claim clock in Receiving once the PO is delivered (C-20)', () => {
    renderUnfold({
      status: 'delivered',
      purchase_order: { ...po, status: 'delivered', delivered_date: '2026-10-13' },
    });
    const receiving = within(screen.getByRole('group', { name: 'Receiving' }));
    expect(receiving.getByTestId('claim-clock')).toHaveTextContent('po-1042');
  });

  it('leaves the claim clock off a line inspected good (C-20)', () => {
    renderUnfold({
      status: 'received',
      received_quantity: 1,
      purchase_order: { ...po, status: 'received', delivered_date: '2026-10-13' },
    });
    expect(screen.queryByTestId('claim-clock')).not.toBeInTheDocument();
  });
});

describe('LineUnfold · one next act above the cells (C-14)', () => {
  const nextAct = () => screen.getByTestId('line-next-act');

  it('lifts Order on a ready line, ahead of the cells', () => {
    renderUnfold();
    const order = within(nextAct()).getByRole('button', {
      name: 'Order',
    });
    expect(order).toHaveAttribute('data-action-variant', 'primary');
    expect(screen.getAllByRole('button', { name: 'Order' })).toHaveLength(1);
    const buy = screen.getByRole('group', { name: 'The buy' });
    expect(
      nextAct().compareDocumentPosition(buy) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('lifts Send to vendor on a drafted PO', () => {
    renderUnfold({
      status: 'ordered',
      purchase_order_id: 'po-1',
      purchase_order: { id: 'po-1', status: 'draft', sent_at: null },
    });
    expect(
      within(nextAct()).getByRole('button', { name: 'Send to vendor' }),
    ).toBeInTheDocument();
  });

  it('lifts the ack on a sent, unacknowledged PO', () => {
    renderUnfold({
      status: 'ordered',
      purchase_order_id: 'po-1',
      purchase_order: { ...po, status: 'sent', acknowledged_at: null },
    });
    expect(within(nextAct()).getByTestId('log-ack-inline')).toBeInTheDocument();
  });

  it('lifts Mark shipped and leaves Movement without a second copy', () => {
    renderUnfold({ status: 'production', purchase_order_id: po.id, purchase_order: po });
    expect(
      within(nextAct()).getByRole('button', { name: 'Mark shipped' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mark shipped' })).toHaveLength(1);
  });

  it('lifts Log inspection on a shipped line', () => {
    renderUnfold({
      status: 'shipped',
      purchase_order_id: po.id,
      purchase_order: { ...po, status: 'shipped' },
    });
    expect(
      within(nextAct()).getByRole('button', { name: 'Log inspection' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Log inspection' })).toHaveLength(1);
  });

  it('lifts Mark installed on a delivered, inspected line', () => {
    renderUnfold({
      status: 'delivered',
      received_quantity: 1,
      purchase_order_id: po.id,
      purchase_order: { ...po, status: 'delivered' },
    });
    expect(
      within(nextAct()).getByRole('button', { name: 'Mark installed' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mark installed' })).toHaveLength(1);
    // Inspection stays reachable in the action row, not as a second lead.
    expect(
      within(nextAct()).queryByRole('button', { name: 'Log inspection' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log inspection' })).toHaveAttribute(
      'data-action-variant',
      'secondary',
    );
  });

  it('keeps Mark installed reachable in place while inspection leads', () => {
    renderUnfold({
      status: 'delivered',
      purchase_order_id: po.id,
      purchase_order: { ...po, status: 'delivered' },
    });
    expect(
      within(nextAct()).getByRole('button', { name: 'Log inspection' }),
    ).toBeInTheDocument();
    expect(
      within(nextAct()).queryByRole('button', { name: 'Mark installed' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mark installed' })).toHaveLength(1);
  });

  it('lifts nothing on an installed line', () => {
    renderUnfold({
      status: 'installed',
      received_quantity: 1,
      purchase_order_id: po.id,
      purchase_order: { ...po, status: 'delivered' },
    });
    expect(screen.queryByTestId('line-next-act')).not.toBeInTheDocument();
  });
});
