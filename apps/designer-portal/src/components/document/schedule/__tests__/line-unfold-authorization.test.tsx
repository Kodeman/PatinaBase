import { fireEvent, render, screen } from '@testing-library/react';
import type { LineAuthorization } from '@/lib/document/authorization-derivation';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useUpdateDamageClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdatePurchaseOrderETA: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useVendor: () => ({ data: { id: 'vendor-1', name: 'Hollowell Woodshop' } }),
}));

jest.mock('@/components/portal/procurement/order-assistant', () => ({
  OrderAssistant: () => null,
}));
jest.mock('@/components/portal/procurement/log-inspection-drawer', () => ({
  LogInspectionDrawer: () => null,
}));
jest.mock('@/components/portal/procurement/po-send-actions', () => ({
  clientVendorEmailHint: () => null,
}));
jest.mock('../../po-preview', () => ({ PoPreview: () => null }));
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
  vendor_name: 'Winfield Workroom',
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
      screen.getByRole('button', { name: /order with assistant/i }),
    ).toBeInTheDocument();
  });

  it('refuses the order act on an unreleased commercial line, and says why', () => {
    renderUnfold({ isCommercialOrigin: true });
    expect(
      screen.getByText('Not yet authorized — no purchase order'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /order with assistant/i }),
    ).not.toBeInTheDocument();
  });

  it('opens the purchase order once the deposit is clear', () => {
    renderUnfold({ isCommercialOrigin: true, auth: authorized });
    expect(
      screen.getByText('PO available — deposit clear (A3)'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /order with assistant/i }),
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
      screen.queryByRole('button', { name: /order with assistant/i }),
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
