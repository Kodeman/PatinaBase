/**
 * C-23 the order paper: header edits through set_purchase_order_header, the
 * terminal act's label and amount, the Patina-maker lane, "Order all" queue
 * stepping, the ship-to never preselected, and po-send's 422 shown inline.
 */

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockCreate = jest.fn();
const mockSetHeader = jest.fn();
const mockSend = jest.fn();
const mockStartCheckout = jest.fn();
const mockFetchPayments = jest.fn();
const mockSetShipTo = jest.fn();
const mockSetShipToLocation = jest.fn();
const mockPush = jest.fn();
const mockCoverage: { data: Record<string, unknown> } = { data: {} };

jest.mock('@patina/supabase', () => ({
  useCreatePurchaseOrder: () => ({ mutateAsync: mockCreate, isPending: false }),
  useSetPurchaseOrderHeader: () => ({ mutateAsync: mockSetHeader, isPending: false }),
  useSendPurchaseOrder: () => ({ mutateAsync: mockSend, isPending: false }),
  useStartPoCheckout: () => ({ mutateAsync: mockStartCheckout, isPending: false }),
  fetchPOPayments: (...args: unknown[]) => mockFetchPayments(...args),
  useFfeInvoiceCoverage: () => ({ data: mockCoverage.data, isLoading: false, isError: false }),
  useProcurementItems: () => ({ data: [] }),
  useStudioIdentity: (params: { projectId?: string }) => ({
    data: params.projectId ? { studioId: 'org-studio', name: 'Middle West Studio' } : undefined,
  }),
  useStudioVendorAccount: (studioId: string | null) => ({
    data:
      studioId === 'org-studio'
        ? {
            account_number: 'HW-0712',
            payment_pattern: 'fifty_fifty',
            deposit_pct: null,
            archived_at: null,
            orders_email_override: null,
            portal_url: null,
          }
        : null,
  }),
  useOrganizations: () => ({
    data: [
      {
        id: 'org-studio',
        name: 'Middle West Studio',
        address: { street: '1 Main St', city: 'Madison', state: 'WI', zip: '53703' },
      },
    ],
  }),
  useProject: () => ({ data: { studio_id: 'org-studio', site_address: '418 Lakeview Dr' } }),
  useStudioLocations: () => ({ data: [] }),
  useSetPurchaseOrderShipTo: () => ({ mutateAsync: mockSetShipTo, isPending: false }),
  useSetPurchaseOrderShipToLocation: () => ({
    mutateAsync: mockSetShipToLocation,
    isPending: false,
  }),
}));

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@/components/document/overlays/doc-sheet', () => ({
  DocSheet: ({ title, pageLabel, children }: { title: string; pageLabel?: string; children: ReactNode }) => (
    <div role="dialog" aria-label={title}>
      <p data-testid="running-head">{pageLabel}</p>
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

import { OrderPaper, OrderPaperQueue, type OrderPaperPurchaseOrder } from '..';

const HEWN = {
  id: 'vendor-hewn',
  name: 'Hewn',
  default_payment_terms: null,
  orders_email: 'orders@hewn.example',
};
const PATINA_MAKER = { ...HEWN, id: 'vendor-patina', name: 'Hale Upholstery', is_patina_catalog: true };
const PROJECT = { id: 'project-1', name: 'Kochaver house' };
const SOFA = {
  id: 'line-sofa',
  name: 'Sofa, COM',
  line_total_cents: 1_500_000,
  trade_price_cents: 1_248_000,
  quantity: 1,
};

const renderPaper = (props: Partial<Parameters<typeof OrderPaper>[0]> = {}) =>
  render(
    <OrderPaper
      open
      onClose={jest.fn()}
      vendor={HEWN}
      project={PROJECT}
      ffeItems={[SOFA]}
      {...props}
    />,
  );

const terminal = (name = 'Send to Hewn · $12,480') => screen.getByRole('button', { name });
const shipToGroup = () => screen.getByRole('group', { name: 'Ship to' });

beforeEach(() => {
  jest.clearAllMocks();
  mockCoverage.data = { 'line-sofa': { coverage: 'paid' } };
  mockCreate.mockResolvedValue({ id: 'po-1', total_cents: 1_248_000 });
  mockSetHeader.mockResolvedValue({ id: 'po-1', project_id: 'project-1' });
  mockSetShipTo.mockResolvedValue({ id: 'po-1' });
  mockSend.mockResolvedValue({ ok: true, recipient: 'orders@hewn.example' });
  mockFetchPayments.mockResolvedValue([{ id: 'pay-1' }]);
  mockStartCheckout.mockResolvedValue({ url: '#stripe-checkout' });
});

describe('the terminal act', () => {
  it('carries the vendor and the amount in its label, with one consequence sentence', () => {
    renderPaper();
    expect(terminal()).toHaveAttribute('data-action-variant', 'terminal');
    expect(screen.getByText(/Sending commits \$12,480 of studio money to Hewn\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save, don.t send/ })).toBeInTheDocument();
  });

  it('says what fronting costs when the client has not paid, and offers to bill first', () => {
    mockCoverage.data = {};
    renderPaper();
    expect(
      screen.getByText(
        "The client hasn't paid for 1 of these yet — sending fronts $12,480 of studio funds until they do.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bill the client first →' })).toBeInTheDocument();
  });
});

describe('ship-to', () => {
  it('preselects nothing and holds the terminal act until a choice is made', () => {
    renderPaper();
    const radios = within(shipToGroup()).getAllByRole('radio');
    expect(radios.length).toBeGreaterThan(1);
    radios.forEach((r) => expect(r).not.toBeChecked());
    expect(screen.getByText('No receiver on file — pick the site or add one.')).toBeInTheDocument();

    expect(terminal()).toHaveAttribute('aria-disabled', 'true');
    expect(terminal()).toHaveAccessibleDescription('choose where this ships');
    fireEvent.click(terminal());
    expect(screen.getByRole('alert')).toHaveTextContent('Choose where this ships.');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("shows po-send's 422 refusal inline and marks the ship-to", async () => {
    mockSend.mockRejectedValueOnce(new Error('ship_to_required'));
    const po: OrderPaperPurchaseOrder = {
      id: 'po-9',
      project_id: 'project-1',
      vendor_id: 'vendor-hewn',
      total_cents: 1_248_000,
      status: 'draft',
      sent_at: null,
      po_number: null,
      payment_pattern: 'fifty_fifty',
      is_patina_catalog: false,
      ship_to: 'Dock 4, Racine',
      sidemark: 'MWS-KOCH-LR',
    };
    renderPaper({ purchaseOrder: po });
    fireEvent.click(terminal());
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Choose where this ships.'),
    );
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ purchaseOrderId: 'po-9', mode: 'send' }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
    expect(shipToGroup()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/^Sent/)).not.toBeInTheDocument();
  });
});

describe('header edits', () => {
  it('write a new paper’s header through set_purchase_order_header once the PO exists, then send', async () => {
    renderPaper();
    fireEvent.change(screen.getByLabelText('Requested ship'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText(/^Freight/), { target: { value: 'fob_origin' } });
    fireEvent.change(screen.getByLabelText(/^Note to Hewn/), {
      target: { value: 'Please confirm leg finish.' },
    });
    fireEvent.click(within(shipToGroup()).getByRole('radio', { name: /The job site/ }));
    // Nothing exists yet, so no header write happens before the act.
    expect(mockSetHeader).not.toHaveBeenCalled();

    fireEvent.click(terminal());

    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        vendorId: 'vendor-hewn',
        isPatinaCatalog: false,
        ffeItemIds: ['line-sofa'],
        paymentPattern: 'fifty_fifty',
        sidemark: expect.any(String),
      }),
    );
    expect(mockSetHeader).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      request: {
        requestedShipOn: '2026-10-20',
        freightTerms: 'fob_origin',
        vendorNote: 'Please confirm leg finish.',
      },
    });
    expect(mockSetShipTo).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      shipTo: '418 Lakeview Dr',
    });
    expect(mockSend).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      mode: 'send',
      recipientEmail: 'orders@hewn.example',
      message: 'Please confirm leg finish.',
    });
    // create → header → ship-to → send.
    const order = [mockCreate, mockSetHeader, mockSetShipTo, mockSend].map(
      (m) => m.mock.invocationCallOrder[0],
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // The act is replaced by its record.
    expect(await screen.findByText(/^Sent to orders@hewn\.example · /)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send to Hewn · $12,480' })).not.toBeInTheDocument();
  });

  it('write an existing PO’s header at once, and only what changed', () => {
    const po: OrderPaperPurchaseOrder = {
      id: 'po-9',
      project_id: 'project-1',
      vendor_id: 'vendor-hewn',
      total_cents: 1_248_000,
      status: 'draft',
      sent_at: null,
      po_number: null,
      payment_pattern: 'fifty_fifty',
      is_patina_catalog: false,
      ship_to: 'Dock 4, Racine',
      sidemark: 'MWS-KOCH-LR',
      requested_ship_on: null,
    };
    renderPaper({ purchaseOrder: po });

    fireEvent.change(screen.getByLabelText('Requested ship'), { target: { value: '2026-11-20' } });
    expect(mockSetHeader).toHaveBeenLastCalledWith({
      purchaseOrderId: 'po-9',
      request: { requestedShipOn: '2026-11-20' },
    });

    const sidemark = screen.getByLabelText('Sidemark');
    expect(sidemark).toHaveValue('MWS-KOCH-LR');
    fireEvent.blur(sidemark);
    expect(mockSetHeader).toHaveBeenCalledTimes(1);
    fireEvent.change(sidemark, { target: { value: 'MWS-KOCH-DEN' } });
    fireEvent.blur(sidemark);
    expect(mockSetHeader).toHaveBeenLastCalledWith({
      purchaseOrderId: 'po-9',
      request: { sidemark: 'MWS-KOCH-DEN' },
    });

    fireEvent.change(screen.getByLabelText(/^Freight/), { target: { value: 'prepaid_add' } });
    expect(mockSetHeader).toHaveBeenLastCalledWith({
      purchaseOrderId: 'po-9',
      request: { freightTerms: 'prepaid_add' },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('the Patina-maker lane', () => {
  it('reads "Order from Patina · $X", hides what Patina carries, and goes to Checkout', async () => {
    renderPaper({ vendor: PATINA_MAKER });
    const act = terminal('Order from Patina · $12,480');
    expect(screen.queryByRole('button', { name: /^Send to/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sidemark')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Freight/)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Ship to' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Patina places this order with Hale Upholstery and carries freight and claims.'),
    ).toBeInTheDocument();
    // V1: no Patina cut anywhere on the paper.
    expect(screen.getByRole('dialog').textContent).not.toMatch(/margin|fee|markup|%/i);

    fireEvent.click(act);
    await waitFor(() => expect(mockStartCheckout).toHaveBeenCalledWith({ poPaymentId: 'pay-1' }));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ isPatinaCatalog: true, paymentPattern: 'full_upfront' }),
    );
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('Order all — the queue', () => {
  const orders = [
    { vendor: HEWN, project: { id: 'project-1', name: 'Kochaver house' }, ffeItems: [SOFA] },
    {
      vendor: HEWN,
      project: { id: 'project-2', name: 'Ashby house' },
      ffeItems: [{ ...SOFA, id: 'line-bench', name: 'Bench', trade_price_cents: 210_000 }],
    },
  ];

  it('steps through one paper per (vendor, project) under a running head', async () => {
    const onClose = jest.fn();
    render(<OrderPaperQueue orders={orders} onClose={onClose} />);
    expect(screen.getByTestId('running-head')).toHaveTextContent('1 of 2 · Hewn');
    expect(screen.getByText('Kochaver house')).toBeInTheDocument();

    fireEvent.click(within(shipToGroup()).getByRole('radio', { name: /The job site/ }));
    fireEvent.click(terminal());
    const next = await screen.findByRole('button', { name: 'Next paper · 2 of 2 →' });
    fireEvent.click(next);

    expect(screen.getByTestId('running-head')).toHaveTextContent('2 of 2 · Hewn');
    expect(screen.getByText('Ashby house')).toBeInTheDocument();
    expect(terminal('Send to Hewn · $2,100')).toBeInTheDocument();
    // The next paper starts clean: nothing chosen, nothing recorded.
    within(shipToGroup())
      .getAllByRole('radio')
      .forEach((r) => expect(r).not.toBeChecked());

    fireEvent.click(screen.getByRole('button', { name: 'Skip this paper' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
