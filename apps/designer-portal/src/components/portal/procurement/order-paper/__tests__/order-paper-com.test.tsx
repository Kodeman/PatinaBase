/**
 * C-24 on the order paper: the fabric PO of a frame-and-fabric pair. Its
 * ship-to list leads with the studio's workroom (still nothing preselected),
 * an unapproved CFA warns and never blocks, the fabric PO is linked to the PO
 * it supplies, and the piece's paper says "COM arriving separately".
 */

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FfePairLine } from '@patina/supabase';

const mockCreate = jest.fn();
const mockSetHeader = jest.fn();
const mockSend = jest.fn();
const mockSetShipTo = jest.fn();
const mockSetShipToLocation = jest.fn();
const mockSetSupplies = jest.fn();
const mockPairLines: { data: FfePairLine[] } = { data: [] };
const mockSubmittals: { data: Record<string, unknown>[] } = { data: [] };

jest.mock('@patina/supabase', () => ({
  useVendorQuotes: () => ({ data: [] }),
  useProjectRoomPlacements: () => ({ data: [] }),
  useCreatePurchaseOrder: () => ({ mutateAsync: mockCreate, isPending: false }),
  useSetPurchaseOrderHeader: () => ({ mutateAsync: mockSetHeader, isPending: false }),
  useSendPurchaseOrder: () => ({ mutateAsync: mockSend, isPending: false }),
  useStartPoCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
  fetchPOPayments: jest.fn(),
  useFfeInvoiceCoverage: () => ({
    data: { 'line-fabric': { coverage: 'paid' }, 'line-sofa': { coverage: 'paid' } },
    isLoading: false,
    isError: false,
  }),
  useProcurementItems: () => ({ data: [] }),
  useStudioIdentity: (params: { projectId?: string }) => ({
    data: params.projectId ? { studioId: 'org-studio', name: 'Middle West Studio' } : undefined,
  }),
  useStudioVendorAccount: () => ({ data: null }),
  useOrganizations: () => ({ data: [] }),
  useProject: () => ({ data: { studio_id: 'org-studio', site_address: '418 Lakeview Dr' } }),
  useStudioLocations: () => ({
    data: [
      {
        id: 'loc-receiver',
        kind: 'receiver',
        label: 'Cedar Lake Receiving',
        address: null,
        is_default_receiver: true,
      },
      {
        id: 'loc-hale',
        kind: 'workroom',
        label: 'Hale Upholstery Works',
        address: null,
        is_default_receiver: false,
      },
    ],
  }),
  useSetPurchaseOrderShipTo: () => ({ mutateAsync: mockSetShipTo, isPending: false }),
  useSetPurchaseOrderShipToLocation: () => ({ mutateAsync: mockSetShipToLocation, isPending: false }),
  useFfePairLines: () => ({ data: mockPairLines.data }),
  useProjectSubmittals: () => ({ data: mockSubmittals.data }),
  useSetPurchaseOrderSupplies: () => ({ mutateAsync: mockSetSupplies, isPending: false }),
}));

// C-26: the riders slot has its own suite (riders.test.tsx).
jest.mock('../riders', () => ({ PoRiders: () => null }));
// C-32: no release gate here; the slot's own suite is order-paper-release.test.tsx.
jest.mock('../release-slot', () => ({
  ...jest.requireActual('../release-slot'),
  useReleasePaper: () => ({ mode: 'none', held: false, ownerFirstName: null }),
  SendBackAct: () => null,
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@/components/document/overlays/doc-sheet', () => ({
  DocSheet: ({ title, children }: { title: string; children: ReactNode }) => (
    <div role="dialog" aria-label={title}>
      {children}
    </div>
  ),
}));
jest.mock('@/components/document/po-preview', () => ({ PoPreview: () => null }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/lib/analytics/procurement-events', () => ({
  procurementEvents: {
    coverageGateShown: jest.fn(),
    coverageOverridden: jest.fn(),
    orderBlocked: jest.fn(),
    poCreated: jest.fn(),
    poSent: jest.fn(),
  },
}));

import { OrderPaper } from '..';
import { comLineFacts, fabricLines, suppliesLinks, workroomFirst } from '../com-slot';

const KESSLER = { id: 'vendor-kessler', name: 'Kessler', default_payment_terms: null, orders_email: 'o@k.example' };
const HALE = { id: 'vendor-hale', name: 'Hale Upholstery Works', default_payment_terms: null, orders_email: 'o@h.example' };
const PROJECT = { id: 'project-1', name: 'Hart house' };

const line = (over: Partial<FfePairLine>): FfePairLine => ({
  id: 'x',
  name: 'x',
  project_room_id: null,
  assignment_scope: 'throughout',
  vendor_id: null,
  vendor_name: null,
  purchase_order_id: null,
  parent_ffe_item_id: null,
  link_kind: null,
  purchase_order: null,
  ...over,
});

const SOFA_LINE = line({
  id: 'line-sofa',
  name: 'Sofa',
  vendor_id: HALE.id,
  vendor_name: HALE.name,
  purchase_order_id: 'po-1042',
  purchase_order: {
    id: 'po-1042',
    po_number: 'PO-1042',
    status: 'draft',
    vendor_id: HALE.id,
    supplies_purchase_order_id: null,
  },
});
const FABRIC_LINE = line({
  id: 'line-fabric',
  name: 'Sofa — COM fabric',
  vendor_id: KESSLER.id,
  vendor_name: KESSLER.name,
  parent_ffe_item_id: 'line-sofa',
  link_kind: 'com',
});

const FABRIC_ITEM = {
  id: 'line-fabric',
  name: 'Sofa — COM fabric',
  line_total_cents: 121_600,
  trade_price_cents: 121_600,
  quantity: 1,
};

const renderFabricPaper = () =>
  render(
    <OrderPaper open onClose={jest.fn()} vendor={KESSLER} project={PROJECT} ffeItems={[FABRIC_ITEM]} />,
  );

const shipToGroup = () => screen.getByRole('group', { name: 'Ship to' });

beforeEach(() => {
  jest.clearAllMocks();
  mockPairLines.data = [SOFA_LINE, FABRIC_LINE];
  mockSubmittals.data = [];
  mockCreate.mockResolvedValue({ id: 'po-1043', total_cents: 121_600 });
  mockSetHeader.mockResolvedValue({ id: 'po-1043', project_id: 'project-1' });
  mockSetShipToLocation.mockResolvedValue({ id: 'po-1043' });
  mockSend.mockResolvedValue({ ok: true, recipient: 'o@k.example' });
  mockSetSupplies.mockResolvedValue({ id: 'po-1043', project_id: 'project-1' });
});

describe('the fabric PO ship-to', () => {
  it('leads with the workroom location, and preselects nothing', () => {
    renderFabricPaper();
    const radios = within(shipToGroup()).getAllByRole('radio');
    expect(radios[0]).toHaveAccessibleName(/Hale Upholstery Works/);
    expect(radios.every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText('COM fabric ships to the workroom: Hale Upholstery Works.')).toBeInTheDocument();
  });

  it('keeps the receivers first on a paper with no COM pair', () => {
    mockPairLines.data = [line({ ...FABRIC_LINE, parent_ffe_item_id: null, link_kind: null })];
    renderFabricPaper();
    const radios = within(shipToGroup()).getAllByRole('radio');
    expect(radios[0]).toHaveAccessibleName(/Cedar Lake Receiving/);
    expect(screen.queryByText(/ships to the workroom/)).not.toBeInTheDocument();
  });
});

describe('the CFA warning', () => {
  it('warns on the fabric line when no CFA is approved, and still sends', async () => {
    mockSubmittals.data = [
      { ffe_item_id: 'line-fabric', kind: 'cfa', decision: 'pending', source: 'submittal' },
    ];
    renderFabricPaper();
    expect(
      screen.getByText(
        'CFA from Kessler not yet approved — send anyway? If the dye lot differs, the reorder is on the studio.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('COM for Sofa, shipped to Hale Upholstery Works')).toBeInTheDocument();

    fireEvent.click(within(shipToGroup()).getByRole('radio', { name: /Hale Upholstery Works/ }));
    const act = screen.getByRole('button', { name: /Send to Kessler/ });
    expect(act).not.toBeDisabled();
    fireEvent.click(act);
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    expect(mockSetShipToLocation).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1043',
      locationId: 'loc-hale',
    });
    // The fabric PO now points at the workroom's PO it supplies.
    expect(mockSetSupplies).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1043',
      suppliesPurchaseOrderId: 'po-1042',
    });
  });

  it('says nothing once the CFA is approved', () => {
    mockSubmittals.data = [
      { ffe_item_id: 'line-fabric', kind: 'cfa', decision: 'approved', source: 'submittal' },
    ];
    renderFabricPaper();
    expect(screen.queryByText(/not yet approved/)).not.toBeInTheDocument();
  });
});

describe('the piece paper', () => {
  it('says the COM arrives separately on the mill PO', () => {
    mockPairLines.data = [
      SOFA_LINE,
      {
        ...FABRIC_LINE,
        purchase_order_id: 'po-1043',
        purchase_order: {
          id: 'po-1043',
          po_number: 'PO-1043',
          status: 'sent',
          vendor_id: KESSLER.id,
          supplies_purchase_order_id: null,
        },
      },
    ];
    render(
      <OrderPaper
        open
        onClose={jest.fn()}
        vendor={HALE}
        project={PROJECT}
        ffeItems={[{ id: 'line-sofa', name: 'Sofa', line_total_cents: 648_000, quantity: 1 }]}
      />,
    );
    expect(screen.getByText('COM arriving separately — Kessler PO-1043')).toBeInTheDocument();
  });
});

describe('the COM slot model', () => {
  it('links a fabric PO to its piece PO, and a piece PO from its fabric PO', () => {
    expect(suppliesLinks('po-1043', ['line-fabric'], [SOFA_LINE, FABRIC_LINE])).toEqual([
      { purchaseOrderId: 'po-1043', suppliesPurchaseOrderId: 'po-1042' },
    ]);
    const fabricOrdered = { ...FABRIC_LINE, purchase_order_id: 'po-1043' };
    const sofaUnordered = { ...SOFA_LINE, purchase_order_id: null, purchase_order: null };
    expect(suppliesLinks('po-1042', ['line-sofa'], [sofaUnordered, fabricOrdered])).toEqual([
      { purchaseOrderId: 'po-1043', suppliesPurchaseOrderId: 'po-1042' },
    ]);
    // Nothing to link while the piece is unordered, or once already linked.
    expect(suppliesLinks('po-1043', ['line-fabric'], [sofaUnordered, FABRIC_LINE])).toEqual([]);
  });

  it('never reads a labor child as COM: no pair sentence, no fabric paper, no supplies link', () => {
    const install = line({
      id: 'line-install',
      name: 'Install, wallpaper hanger',
      vendor_name: 'Hang Right',
      parent_ffe_item_id: 'line-sofa',
      link_kind: 'labor',
      purchase_order_id: 'po-2001',
    });
    const lines = [SOFA_LINE, install];
    expect(comLineFacts(['line-sofa'], lines, [], 'Hale').size).toBe(0);
    expect(comLineFacts(['line-install'], lines, [], 'Hang Right').size).toBe(0);
    expect(fabricLines(['line-install'], lines)).toEqual([]);
    expect(suppliesLinks('po-1042', ['line-sofa'], lines)).toEqual([]);
    expect(suppliesLinks('po-2001', ['line-install'], lines)).toEqual([]);
  });

  it('never warns while the submittals are unknown', () => {
    const facts = comLineFacts(['line-fabric'], [SOFA_LINE, FABRIC_LINE], null, 'Kessler');
    expect(facts.get('line-fabric')?.cfaWarning).toBeNull();
  });

  it('puts workrooms first and keeps the rest in order', () => {
    expect(
      workroomFirst([{ kind: 'receiver' }, { kind: 'storage' }, { kind: 'workroom' }]).map((l) => l.kind),
    ).toEqual(['workroom', 'receiver', 'storage']);
  });
});
