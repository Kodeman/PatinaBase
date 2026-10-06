import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { LineAuthorization } from '@/lib/document/authorization-derivation';
import { todayYmd } from '@/lib/document/format';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

// Money out reads its own payment hooks; its suite is line-unfold/__tests__.
jest.mock('../../line-unfold/money-out-cell', () => ({ MoneyOutCell: () => null }));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const mockAdvancePo = jest.fn();
const mockRecordInstalled = jest.fn();

jest.mock('@patina/supabase', () => ({
  useUpdateDamageClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdatePurchaseOrderETA: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useUpdatePurchaseOrderStatus: () => ({
    mutateAsync: mockAdvancePo,
    isPending: false,
  }),
  useRecordFfeInstalled: () => ({
    mutateAsync: mockRecordInstalled,
    isPending: false,
  }),
  useVendor: () => ({ data: { id: 'vendor-1', name: 'Hollowell Woodshop' } }),
  // C-05 commercials block (covered in line-unfold-commercials.test.tsx).
  useSetFfeLineCommercials: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useFindVendorMatch: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useResolveOrCreateVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useVendors: () => ({ data: { data: [] } }),
  useProductPrices: () => ({ data: undefined }),
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
jest.mock('../../po-preview', () => ({
  PoPreview: () => null,
  LogAckInline: ({
    purchaseOrderId,
    sentAt,
  }: {
    purchaseOrderId: string;
    sentAt?: string | null;
  }) => (
    <div data-testid="log-ack-inline">
      Log ack {purchaseOrderId} {sentAt}
    </div>
  ),
}));
jest.mock('../../accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
}));
jest.mock('../../folio-strip', () => ({ FolioStrip: () => null }));
jest.mock('@/hooks/use-document-rooms', () => ({
  useDocumentRooms: () => ({
    data: [{ id: 'room-1', name: 'Primary bedroom' }],
  }),
  useAssignLineRoom: () => ({ mutate: jest.fn() }),
}));

import { LineUnfold } from '../../line-unfold';

const item = {
  id: 'line-1',
  name: 'Roman shades, six windows',
  quantity: 6,
  status: 'specified',
  blocked: false,
  item_type: 'fixed',
  unit_price_cents: 65000,
  line_total_cents: 390000,
  project_room_id: 'room-1',
  received_quantity: null,
  vendor_id: 'vendor-1',
  vendor_name: 'Winfield Workroom',
  design_disposition: 'selected',
  purchase_order_id: null,
};

const authorized: LineAuthorization = {
  track: 'authorized',
  number: 3,
  signedLineTotalCents: 390000,
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

describe('LineUnfold · the authorization gate', () => {
  it('says nothing new on a project with no agreement behind it', () => {
    renderUnfold();
    expect(
      screen.queryByTestId('line-authorization-strip'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^order$/i }),
    ).toBeInTheDocument();
  });

  it('refuses the order act on an unreleased commercial line, and says why', () => {
    renderUnfold({ isCommercialOrigin: true });
    expect(
      screen.getByText('Not yet authorized — no purchase order'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^order$/i }),
    ).not.toBeInTheDocument();
  });

  it('opens the purchase order once the deposit is clear', () => {
    renderUnfold({ isCommercialOrigin: true, auth: authorized });
    expect(
      screen.getByText('PO available — deposit clear (A3)'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^order$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/signed price \$3,900 · deposit clear/),
    ).toBeInTheDocument();
  });

  it('holds while the deposit is outstanding', () => {
    renderUnfold({
      isCommercialOrigin: true,
      auth: { ...authorized, depositClear: false },
    });
    expect(
      screen.getByText(
        'Authorized — the purchase order opens when the deposit clears (A3)',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^order$/i }),
    ).not.toBeInTheDocument();
  });

  it('states the drift without moving the signed price', () => {
    renderUnfold({
      isCommercialOrigin: true,
      auth: { ...authorized, signedLineTotalCents: 420000, deltaCents: 45000 },
    });
    expect(
      screen.getByText('authorized $4,200 · now $4,650'),
    ).toBeInTheDocument();
  });

  it('softly locks the room re-assign once the line is on an instrument', () => {
    renderUnfold({ isCommercialOrigin: true, auth: authorized });
    expect(screen.getByLabelText('Assign to room')).toBeDisabled();
    expect(
      screen.getAllByText('on authorization № 3 — void & supersede to change')
        .length,
    ).toBeGreaterThan(0);
  });

  it('offers Order on a no-agreement job with the R-PB1 warning above it', () => {
    renderUnfold();
    expect(
      screen.getByText(
        'No signed agreement behind this yet. You can still order.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^order$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('line-order-readiness'),
    ).not.toBeInTheDocument();
  });

  it('hides Order on a line the database would refuse, and says why in words', () => {
    renderUnfold({
      item: {
        ...item,
        vendor_id: null,
        unit_price_cents: null,
        design_disposition: 'candidate',
      },
    });
    expect(
      screen.queryByRole('button', { name: /^order$/i }),
    ).not.toBeInTheDocument();
    const reasons = screen.getByTestId('line-order-readiness');
    expect(reasons).toHaveTextContent('Not selected yet');
    expect(reasons).toHaveTextContent('Needs a maker');
    expect(reasons).toHaveTextContent('Needs a client price');
    expect(
      screen.queryByText(
        'No signed agreement behind this yet. You can still order.',
      ),
    ).not.toBeInTheDocument();
  });

  it('leaves the room re-assign alone while the line is unreleased', () => {
    renderUnfold({ isCommercialOrigin: true });
    expect(screen.getByLabelText('Assign to room')).toBeEnabled();
  });

  it('locks an awaiting-signature line too', () => {
    renderUnfold({
      isCommercialOrigin: true,
      auth: { track: 'awaiting', number: 4 },
    });
    expect(screen.getByLabelText('Assign to room')).toBeDisabled();
    expect(
      screen.getAllByText('on authorization № 4 — void & supersede to change')
        .length,
    ).toBeGreaterThan(0);
  });

  it('offers the way into the next release, and creates nothing itself', () => {
    const onIncludeInRelease = jest.fn();
    renderUnfold({ isCommercialOrigin: true, onIncludeInRelease });
    fireEvent.click(
      screen.getByRole('button', { name: /include in the next release/i }),
    );
    expect(onIncludeInRelease).toHaveBeenCalledTimes(1);
  });

  it('withholds that act once the line is already on an instrument', () => {
    renderUnfold({
      isCommercialOrigin: true,
      auth: authorized,
      onIncludeInRelease: jest.fn(),
    });
    expect(
      screen.queryByRole('button', { name: /include in the next release/i }),
    ).not.toBeInTheDocument();
  });
});

describe('LineUnfold · piece artifact plate', () => {
  it('uses the joined product image, maker, and configuration language', () => {
    renderUnfold({
      showArtifactPlate: true,
      item: {
        ...item,
        name: 'Halden Sofa',
        quantity: 1,
        product: {
          id: 'product-1',
          name: 'Halden Sofa',
          brand: 'Hollowell Woodshop',
          images: ['https://images.example.com/halden-sofa.jpg'],
        },
        spec: {
          configuration_snapshot: {
            selections: [
              { groupName: 'Wood', valueLabel: 'Walnut' },
              { groupName: 'Hardware Finish', valueLabel: 'Antique Brass' },
            ],
          },
        },
      },
    });

    expect(
      screen.getByRole('img', { name: 'Halden Sofa by Hollowell Woodshop' }),
    ).toHaveAttribute(
      'src',
      'https://images.example.com/halden-sofa.jpg',
    );
    const plate = within(screen.getByRole('figure'));
    expect(plate.getByText('Maker').parentElement).toHaveTextContent(
      'Maker · Hollowell Woodshop',
    );
    expect(plate.getByText('Source').parentElement).toHaveTextContent(
      'Source · Winfield Workroom',
    );
    expect(screen.getByText('Walnut')).toBeInTheDocument();
    expect(screen.getByText('Antique Brass')).toBeInTheDocument();
  });

  it('states missing image, maker, and configuration data without inventing it', () => {
    renderUnfold({
      showArtifactPlate: true,
      item: { ...item, vendor_name: null },
    });

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Image not on file')).toBeInTheDocument();
    const plate = within(screen.getByRole('figure'));
    expect(plate.getByText(/Maker/).parentElement).toHaveTextContent(
      'Maker · Not recorded',
    );
    expect(plate.getByText('Source').parentElement).toHaveTextContent(
      'Source · Not recorded',
    );
    expect(
      screen.getByText('Configuration not recorded on this line.'),
    ).toBeInTheDocument();
  });

  it('stays out of non-project unfolds', () => {
    renderUnfold({ showArtifactPlate: false });

    expect(screen.queryByText('Piece in hand')).not.toBeInTheDocument();
    expect(screen.queryByText('Image not on file')).not.toBeInTheDocument();
  });

  it('stays out of trade-line unfolds even in project mode', () => {
    renderUnfold({
      showArtifactPlate: true,
      item: { ...item, trade_scope_document_id: 'trade-scope-1' },
    });

    expect(screen.queryByText('Piece in hand')).not.toBeInTheDocument();
  });

  it('falls back honestly when the joined image cannot load', () => {
    renderUnfold({
      showArtifactPlate: true,
      item: {
        ...item,
        product: {
          brand: 'Hollowell Woodshop',
          images: ['https://images.example.com/missing.jpg'],
        },
      },
    });

    fireEvent.error(
      screen.getByRole('img', {
        name: 'Roman shades, six windows by Hollowell Woodshop',
      }),
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Image not on file')).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// R7 (F6) — where the lifecycle trail is allowed to appear
// ══════════════════════════════════════════════════════════════════════════

describe('LineUnfold · the trail mount guard', () => {
  const trail = (c: HTMLElement) => c.querySelector('[data-procurement-trail]');

  it('draws the trail on a furnishings line with a purchase order behind it', () => {
    const { container } = renderUnfold({
      item: {
        ...item,
        status: 'production',
        purchase_order: {
          id: 'po-1',
          status: 'in_production',
          vendor_id: 'vendor-1',
          sent_at: '2026-05-03',
        },
      },
    });
    expect(trail(container)).toBeInTheDocument();
  });

  // A trade scope runs its own journey — tile does not ship or arrive.
  it('NEVER draws the trail on a trade line', () => {
    const { container } = renderUnfold({
      item: {
        ...item,
        status: 'production',
        trade_scope_document_id: 'pcd-1',
        purchase_order: {
          id: 'po-1',
          status: 'in_production',
          vendor_id: 'vendor-1',
        },
      },
    });
    expect(trail(container)).not.toBeInTheDocument();
  });

  // No eighteen-row empty scaffold on a line nobody has ordered yet.
  it.each(['specified', 'quoted', 'approved'])(
    'draws no trail on a %s line with no order behind it',
    (status) => {
      const { container } = renderUnfold({ item: { ...item, status } });
      expect(trail(container)).not.toBeInTheDocument();
    },
  );

  it('draws the trail once a line carries evidence even without a PO row', () => {
    const { container } = renderUnfold({
      item: { ...item, status: 'installed' },
    });
    expect(trail(container)).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C-10 — the acknowledgment act, lifted as the line's next act (C-14)
// ══════════════════════════════════════════════════════════════════════════

describe('LineUnfold · log acknowledgment as the next act', () => {
  const withPo = (po: Record<string, unknown>) =>
    renderUnfold({
      item: {
        ...item,
        status: 'ordered',
        purchase_order: {
          id: 'po-7',
          status: 'sent',
          vendor_id: 'vendor-1',
          vendor_po_number: null,
          confirmed_eta: null,
          ...po,
        },
      },
    });

  it('lifts it above the cells when the PO is sent and not yet acknowledged', () => {
    withPo({ sent_at: '2026-10-01T12:00:00Z', acknowledged_at: null });
    const ack = screen.getByTestId('log-ack-inline');
    expect(screen.getByTestId('line-next-act')).toContainElement(ack);
    expect(screen.getByTestId('line-po-cell')).not.toContainElement(ack);
    expect(screen.getByTestId('line-po-cell')).toHaveTextContent(
      'awaiting acknowledgment',
    );
    expect(ack).toHaveTextContent('Log ack po-7 2026-10-01T12:00:00Z');
  });

  it('withholds it once the vendor has acknowledged', () => {
    withPo({
      sent_at: '2026-10-01T12:00:00Z',
      acknowledged_at: '2026-10-02T12:00:00Z',
    });
    expect(screen.queryByTestId('log-ack-inline')).not.toBeInTheDocument();
  });

  it('withholds it while the PO is unsent', () => {
    withPo({ status: 'draft', sent_at: null, acknowledged_at: null });
    expect(screen.queryByTestId('log-ack-inline')).not.toBeInTheDocument();
  });

  it('withholds it on a cancelled PO', () => {
    withPo({
      status: 'cancelled',
      sent_at: '2026-10-01T12:00:00Z',
      acknowledged_at: null,
    });
    expect(screen.queryByTestId('log-ack-inline')).not.toBeInTheDocument();
  });

  it('withholds it on a line with no purchase order', () => {
    renderUnfold();
    expect(screen.queryByTestId('log-ack-inline')).not.toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C-03 — the Movement cell's status acts (confirmed → in production → shipped)
// ══════════════════════════════════════════════════════════════════════════

describe('LineUnfold · Movement status acts', () => {
  beforeEach(() => {
    mockAdvancePo.mockReset();
  });

  const withPoStatus = (status: string, itemStatus = 'ordered') =>
    renderUnfold({
      item: {
        ...item,
        status: itemStatus,
        purchase_order: {
          id: 'po-9',
          status,
          vendor_id: 'vendor-1',
          sent_at: '2026-10-01T12:00:00Z',
          acknowledged_at: '2026-10-02T12:00:00Z',
          confirmed_eta: null,
        },
      },
    });

  const inProduction = () =>
    screen.queryByRole('button', { name: 'Mark in production' });
  const shipped = () => screen.queryByRole('button', { name: 'Mark shipped' });

  it('offers "Mark in production" only on a confirmed PO', () => {
    withPoStatus('confirmed');
    expect(inProduction()).toBeInTheDocument();
    expect(shipped()).not.toBeInTheDocument();
  });

  it('offers "Mark shipped" only on a PO in production', () => {
    withPoStatus('in_production', 'production');
    expect(shipped()).toBeInTheDocument();
    expect(inProduction()).not.toBeInTheDocument();
  });

  it.each(['draft', 'sent', 'shipped', 'delivered', 'cancelled'])(
    'offers neither act on a %s PO (delivered stays receipt-driven)',
    (status) => {
      withPoStatus(status);
      expect(inProduction()).not.toBeInTheDocument();
      expect(shipped()).not.toBeInTheDocument();
    },
  );

  it('offers neither act on a line with no purchase order', () => {
    renderUnfold();
    expect(inProduction()).not.toBeInTheDocument();
    expect(shipped()).not.toBeInTheDocument();
  });

  it('"Mark in production" advances the PO, then offers "Mark shipped" at once', async () => {
    mockAdvancePo.mockResolvedValue({ id: 'po-9', status: 'in_production' });
    withPoStatus('confirmed');
    fireEvent.click(inProduction() as HTMLElement);
    expect(mockAdvancePo).toHaveBeenCalledWith({
      purchaseOrderId: 'po-9',
      status: 'in_production',
      projectId: 'project-1',
    });
    expect(await screen.findByRole('button', { name: 'Mark shipped' })).toBeInTheDocument();
    expect(inProduction()).not.toBeInTheDocument();
  });

  it('"Mark shipped" advances the PO to shipped', () => {
    mockAdvancePo.mockResolvedValue({ id: 'po-9', status: 'shipped' });
    withPoStatus('in_production', 'production');
    fireEvent.click(shipped() as HTMLElement);
    expect(mockAdvancePo).toHaveBeenCalledWith({
      purchaseOrderId: 'po-9',
      status: 'shipped',
      projectId: 'project-1',
    });
  });

  it('says "Couldn’t save" inline when the move is refused', async () => {
    mockAdvancePo.mockRejectedValue(new Error('refused'));
    withPoStatus('confirmed');
    fireEvent.click(inProduction() as HTMLElement);
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t save/i);
    // The act stays put for another try.
    expect(inProduction()).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C-04 — Mark installed, only from delivered
// ══════════════════════════════════════════════════════════════════════════

describe('LineUnfold · Mark installed', () => {
  beforeEach(() => {
    mockRecordInstalled.mockReset();
  });

  const markInstalled = () =>
    screen.queryByRole('button', { name: 'Mark installed' });

  it('offers the act on a delivered line, with today as the day', () => {
    renderUnfold({ item: { ...item, status: 'delivered' } });
    expect(markInstalled()).toBeInTheDocument();
    expect(screen.getByLabelText('Install date')).toBeInTheDocument();
  });

  it.each(['specified', 'ordered', 'production', 'shipped', 'installed'])(
    'withholds it on a %s line',
    (status) => {
      renderUnfold({ item: { ...item, status } });
      expect(markInstalled()).not.toBeInTheDocument();
    },
  );

  it('records this line installed today by default', async () => {
    mockRecordInstalled.mockResolvedValue([]);
    renderUnfold({ item: { ...item, status: 'delivered' } });
    fireEvent.click(markInstalled() as HTMLElement);
    expect(mockRecordInstalled).toHaveBeenCalledWith({
      projectId: 'project-1',
      itemIds: ['line-1'],
      installedOn: todayYmd(),
    });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('lets the server pick today when the day is cleared', () => {
    mockRecordInstalled.mockResolvedValue([]);
    renderUnfold({ item: { ...item, status: 'delivered' } });
    fireEvent.click(screen.getByLabelText('Clear date'));
    fireEvent.click(markInstalled() as HTMLElement);
    expect(mockRecordInstalled).toHaveBeenCalledWith({
      projectId: 'project-1',
      itemIds: ['line-1'],
      installedOn: undefined,
    });
  });

  it('says "Couldn’t save" inline when the call is refused', async () => {
    mockRecordInstalled.mockRejectedValue(new Error('refused'));
    renderUnfold({ item: { ...item, status: 'delivered' } });
    fireEvent.click(markInstalled() as HTMLElement);
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t save/i);
  });
});
