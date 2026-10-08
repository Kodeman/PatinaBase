import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  usePurchaseOrders,
  useUpdatePurchaseOrderETA,
  useVendors,
} from '@patina/supabase';
import { OrdersLedger, ordersSendLanding } from './orders-ledger';

const mockPush = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockMutateEta = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

const mockHeld: { data: Record<string, unknown>[] } = { data: [] };

jest.mock('@patina/supabase', () => ({
  usePurchaseOrders: jest.fn(),
  useUpdatePurchaseOrderETA: jest.fn(),
  useVendors: jest.fn(),
  useHeldPurchaseOrders: () => ({ data: mockHeld.data }),
}));

// The paper's own suites live under order-paper/__tests__.
jest.mock('@/components/portal/procurement/order-paper', () => ({
  ExistingOrderPaper: ({ purchaseOrder }: { purchaseOrder: { id: string } }) => (
    <div data-testid="order-paper">Paper {purchaseOrder.id}</div>
  ),
}));

jest.mock('@/components/portal/procurement/po-send-actions', () => ({
  clientVendorEmailHint: () => 'orders@example.com',
}));

jest.mock('./stamp', () => ({
  Stamp: ({ label }: { label: string }) => <span>{label}</span>,
}));

jest.mock('./po-preview', () => ({
  PoPreview: ({ purchaseOrderId }: { purchaseOrderId: string }) => (
    <div data-testid="po-preview">Preview {purchaseOrderId}</div>
  ),
  LogAckInline: ({ purchaseOrderId }: { purchaseOrderId: string }) => (
    <div data-testid="ack-unfold">Acknowledgment {purchaseOrderId}</div>
  ),
}));

jest.mock('./ledger-front-matter', () => ({
  LedgerFrontMatter: ({
    caption,
    stats,
  }: {
    caption: string;
    stats: { label: string; value: string }[];
  }) => (
    <div data-testid="front-matter" data-caption={caption}>
      {stats.map((s) => `${s.value} ${s.label}`).join(' | ')}
    </div>
  ),
  dueToMakers: jest.requireActual('./ledger-front-matter').dueToMakers,
}));

// The band's own acts are proven in line-unfold/__tests__/money-out.test.tsx.
jest.mock('./line-unfold/record-payment', () => ({
  PoMoneyOut: ({
    purchaseOrderId,
    isPatinaCatalog,
  }: {
    purchaseOrderId: string;
    isPatinaCatalog?: boolean;
  }) => (
    <div data-testid="money-band">
      {purchaseOrderId}
      {isPatinaCatalog ? ' · catalog' : ''}
    </div>
  ),
}));

// The Folio-backed trigger is proven in its own suite (date-text-input.test.tsx);
// here we only need a controlled stand-in so the ledger's own plumbing (value
// in, onChange out) can be exercised directly.
jest.mock('./date-text-input', () => ({
  DateTextInput: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string | null;
    onChange: (value: string | null) => void;
    ariaLabel?: string;
  }) => (
    <input
      type="text"
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || null)}
    />
  ),
}));

jest.mock('@/lib/document/ledger-summary', () => ({
  ordersThroughput: () => [],
}));

jest.mock('./orders-book-vendors', () => ({
  VendorsBookPage: () => <div>Vendor page</div>,
}));

jest.mock('./orders-book-week', () => ({
  WeekBookPage: ({
    projectId,
    onClearProject,
  }: {
    projectId?: string | null;
    onClearProject?: () => void;
  }) => (
    <div>
      Week page · {projectId ?? 'none'}
      <button type="button" onClick={onClearProject}>
        clear week lens
      </button>
    </div>
  ),
}));

jest.mock('./orders-book-receiving', () => ({
  ReceivingBookPage: ({
    projectId,
    onClearProject,
  }: {
    projectId?: string | null;
    onClearProject?: () => void;
  }) => (
    <div>
      Receiving page · {projectId ?? 'none'}
      <button type="button" onClick={onClearProject}>
        clear receiving lens
      </button>
    </div>
  ),
}));

jest.mock('./overlays/doc-sheet', () => ({
  DocSheetHead: ({
    title,
    pageLabel,
  }: {
    title: string;
    pageLabel: string;
  }) => (
    <header>
      {title} · {pageLabel}
    </header>
  ),
}));

jest.mock('@/lib/document/registry', () => ({
  STUDIO_LEDGERS: [{ key: 'orders', icon: () => null }],
}));

jest.mock('@/lib/help-system/document-surface-keys', () => ({
  DOCUMENT_SURFACE_KEYS: {
    orders: 'orders',
    ordersWeek: 'orders-week',
    ordersReceiving: 'orders-receiving',
    ordersVendors: 'orders-vendors',
  },
}));

jest.mock('./document-action', () => ({
  DocumentAction: ({
    actionKey,
    children,
    onClick,
    disabled,
    loading,
  }: {
    actionKey: string;
    children: ReactNode;
    onClick?: () => void | Promise<void>;
    disabled?: boolean;
    loading?: boolean;
  }) => (
    <button
      type="button"
      data-action-key={actionKey}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {children}
    </button>
  ),
}));

const mockUsePurchaseOrders = usePurchaseOrders as jest.Mock;
const mockUseUpdatePurchaseOrderETA = useUpdatePurchaseOrderETA as jest.Mock;
const mockUseVendors = useVendors as jest.Mock;

const ORDERS = [
  {
    id: 'po-1',
    po_number: 'PO 1001',
    vendor_po_number: 'V-1001',
    vendor_id: 'vendor-1',
    project_id: 'project-1',
    project: { id: 'project-1', name: 'Oak House' },
    total_cents: 125_000,
    status: 'draft',
    sent_at: null,
    acknowledged_at: null,
    confirmed_eta: '2026-08-15',
    is_patina_catalog: false,
    payments: [{ state: 'due' }],
  },
  {
    id: 'po-2',
    po_number: 'PO 1002',
    vendor_po_number: 'V-1002',
    vendor_id: 'vendor-1',
    project_id: 'project-2',
    project: { id: 'project-2', name: 'Lake House' },
    total_cents: 242_000,
    status: 'shipped',
    sent_at: '2026-07-12T00:00:00Z',
    acknowledged_at: null,
    confirmed_eta: null,
    is_patina_catalog: false,
    payments: [{ state: 'due' }],
  },
  {
    id: 'po-3',
    po_number: 'PO 2001',
    vendor_po_number: 'V-2001',
    vendor_id: 'vendor-2',
    project_id: 'project-2',
    project: { id: 'project-2', name: 'Lake House' },
    total_cents: 84_000,
    status: 'confirmed',
    sent_at: null,
    acknowledged_at: null,
    confirmed_eta: '2026-09-03',
    is_patina_catalog: false,
    payments: [{ state: 'paid' }],
  },
];

const VENDORS = [
  { id: 'vendor-1', name: 'Atelier One' },
  { id: 'vendor-2', name: 'Atelier Two' },
];

function renderBook() {
  const onClose = jest.fn();
  const result = render(<OrdersLedger onClose={onClose} />);
  return { ...result, onClose };
}

describe('OrdersLedger quiet register', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockInvalidateQueries.mockReset();
    mockMutateEta.mockReset();
    mockMutateEta.mockResolvedValue(undefined);
    mockUsePurchaseOrders.mockReturnValue({
      data: ORDERS,
      isLoading: false,
    });
    mockUseVendors.mockReturnValue({ data: { data: VENDORS } });
    mockUseUpdatePurchaseOrderETA.mockReturnValue({
      mutateAsync: mockMutateEta,
    });
  });

  it('opens as a two-line register with bulk controls hidden and row acts intact', () => {
    const { container, onClose } = renderBook();

    expect(screen.getByText('Orders · Ledger')).toBeInTheDocument();
    expect(screen.queryByText(/the studio book/i)).not.toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(container.querySelector('[data-orders-bulk-bar]')).toBeNull();

    const rows = container.querySelectorAll('[data-orders-po-row]');
    expect(rows).toHaveLength(3);
    rows.forEach((row) => {
      expect(row.querySelector('[data-orders-po-primary]')).not.toBeNull();
      expect(row.querySelector('[data-orders-po-secondary]')).not.toBeNull();
      expect(row.querySelector('[data-orders-po-actions]')).not.toBeNull();
    });
    expect(
      container.querySelectorAll('[data-orders-unscheduled]'),
    ).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'send →' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'resend' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pdf' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'log ack ↓' }));
    expect(screen.getByTestId('ack-unfold')).toHaveTextContent('po-2');

    fireEvent.click(screen.getByRole('button', { name: 'resend' }));
    expect(screen.getByTestId('po-preview')).toHaveTextContent('po-2');

    fireEvent.click(
      screen.getAllByRole('button', { name: 'open document →' })[0],
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/doc/project-1');
  });

  it('enters and exits multi-select explicitly, clearing selection on exit', () => {
    const { container } = renderBook();

    fireEvent.click(screen.getByRole('button', { name: 'Select multiple' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select V-1001' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select V-1002' }));
    expect(
      screen.getByText('2 orders · align one confirmed ETA'),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-orders-bulk-bar]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Done selecting · 2' }));
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(container.querySelector('[data-orders-bulk-bar]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Select multiple' }));
    screen.getAllByRole('checkbox').forEach((checkbox) => {
      expect(checkbox).not.toBeChecked();
    });
  });

  it('clears selected POs whenever a project or payment lens changes', () => {
    const { container } = renderBook();

    fireEvent.click(screen.getByRole('button', { name: 'Select multiple' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select V-1001' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select V-1002' }));
    expect(container.querySelector('[data-orders-bulk-bar]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Oak House' }));
    expect(container.querySelector('[data-orders-bulk-bar]')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Done selecting' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Select V-1001' }),
    ).not.toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select V-1001' }));
    fireEvent.click(screen.getByRole('button', { name: 'paid' }));
    expect(container.querySelector('[data-orders-bulk-bar]')).toBeNull();
    expect(
      screen.queryByRole('checkbox', { name: 'Select V-1001' }),
    ).not.toBeInTheDocument();
  });

  it('keeps same-vendor ETA alignment truthful and preserves its mutation contract', async () => {
    renderBook();

    fireEvent.click(screen.getByRole('button', { name: 'Select multiple' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select V-1001' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select V-1002' }));
    fireEvent.change(screen.getByLabelText('Shared ETA'), {
      target: { value: '2026-09-18' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Align ETA' }));

    await waitFor(() => expect(mockMutateEta).toHaveBeenCalledTimes(2));
    expect(mockMutateEta).toHaveBeenNthCalledWith(1, {
      purchaseOrderId: 'po-1',
      newEta: '2026-09-18',
      notes: 'ETA aligned across 2 POs (same truck)',
    });
    expect(mockMutateEta).toHaveBeenNthCalledWith(2, {
      purchaseOrderId: 'po-2',
      newEta: '2026-09-18',
      notes: 'ETA aligned across 2 POs (same truck)',
    });
  });

  it('does not offer ETA alignment for a mixed-vendor selection', () => {
    renderBook();

    fireEvent.click(screen.getByRole('button', { name: 'Select multiple' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select V-1001' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select V-2001' }));

    expect(
      screen.getByText(
        '2 orders · select orders from one vendor to align an ETA',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Shared ETA')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Align ETA' }),
    ).not.toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// US-16 (C-08) — the project lens follows the designer onto Week and
// Receiving, not just Ledger.
// ══════════════════════════════════════════════════════════════════════════

describe('OrdersLedger · project lens carries across pages (US-16)', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockInvalidateQueries.mockReset();
    mockUsePurchaseOrders.mockReturnValue({ data: ORDERS, isLoading: false });
    mockUseVendors.mockReturnValue({ data: { data: VENDORS } });
    mockUseUpdatePurchaseOrderETA.mockReturnValue({
      mutateAsync: mockMutateEta,
    });
  });

  it('seeds the Ledger lens from initialContext.projectId', () => {
    render(
      <OrdersLedger
        onClose={jest.fn()}
        initialContext={{ projectId: 'project-2' }}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Lake House' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Oak House' }),
    ).toHaveAttribute('aria-pressed', 'false');
    // Lensed to project-2: po-2 and po-3, not po-1 (Oak House).
    expect(
      document.querySelectorAll('[data-orders-po-row]'),
    ).toHaveLength(2);
  });

  it('passes the seeded lens to the Week page', () => {
    render(
      <OrdersLedger
        onClose={jest.fn()}
        initialContext={{ projectId: 'project-2', page: 'week' }}
      />,
    );

    expect(screen.getByText('Week page · project-2')).toBeInTheDocument();
  });

  it('passes the seeded lens to the Receiving page, and "all projects" clears it', () => {
    render(
      <OrdersLedger
        onClose={jest.fn()}
        initialContext={{ projectId: 'project-2', page: 'receiving' }}
      />,
    );

    expect(
      screen.getByText('Receiving page · project-2'),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'clear receiving lens' }),
    );

    expect(screen.getByText('Receiving page · none')).toBeInTheDocument();
  });

  it('with no project context, the lens stays unset on Week and Receiving (behavior unchanged)', () => {
    const { unmount } = render(
      <OrdersLedger onClose={jest.fn()} initialContext={{ page: 'week' }} />,
    );
    expect(screen.getByText('Week page · none')).toBeInTheDocument();
    unmount();

    render(
      <OrdersLedger
        onClose={jest.fn()}
        initialContext={{ page: 'receiving' }}
      />,
    );
    expect(screen.getByText('Receiving page · none')).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// R7 — the same grammar at ledger density
// ══════════════════════════════════════════════════════════════════════════

describe('OrdersLedger · lifecycle columns (R7)', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockUseVendors.mockReturnValue({ data: { data: VENDORS } });
    mockUseUpdatePurchaseOrderETA.mockReturnValue({
      mutateAsync: mockMutateEta,
    });
  });

  function bookOf(orders: unknown[]) {
    mockUsePurchaseOrders.mockReturnValue({ data: orders, isLoading: false });
    return render(<OrdersLedger onClose={jest.fn()} />);
  }

  const po = (over: Record<string, unknown>) => ({
    id: 'po-x',
    po_number: 'PO 9001',
    vendor_po_number: 'V-9001',
    vendor_id: 'vendor-1',
    project_id: 'project-1',
    project: { id: 'project-1', name: 'Oak House' },
    total_cents: 1000,
    status: 'draft',
    sent_at: null,
    acknowledged_at: null,
    confirmed_eta: null,
    is_patina_catalog: false,
    payments: [],
    ...over,
  });

  // F1 — a draft is a document being written, not a position on the trail.
  it('still says "draft" — the vacuous-deposit rule never releases a draft', () => {
    bookOf([po({ status: 'draft' })]);
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.queryByText('Cleared to produce')).not.toBeInTheDocument();
  });

  // The ledger has always filtered cancelled orders out of the register
  // (pre-existing, unrelated to R7), so there is no row to carry a word at
  // all. The derivation-level guarantee — that a cancelled order takes no
  // trail position — is asserted in procurement-lifecycle.test.ts.
  it('keeps cancelled orders out of the register entirely, lifecycle or not', () => {
    const { container } = bookOf([
      po({
        status: 'cancelled',
        sent_at: '2026-05-03',
        acknowledged_at: '2026-05-06',
      }),
    ]);
    expect(container.querySelectorAll('[data-orders-po-row]')).toHaveLength(0);
    expect(screen.queryByText('Cleared to produce')).not.toBeInTheDocument();
    expect(screen.queryByText('Released to maker')).not.toBeInTheDocument();
  });

  it('reads the lifecycle position for a live order', () => {
    bookOf([po({ status: 'in_production', sent_at: '2026-05-03' })]);
    expect(screen.getByText('In production')).toBeInTheDocument();
    expect(screen.queryByText('in production')).not.toBeInTheDocument();
  });

  // F2 — a gate behind the work is not "next".
  it('never names a gate the work has already passed', () => {
    const { container } = bookOf([
      po({
        status: 'delivered',
        sent_at: '2026-05-03',
        delivered_date: '2026-06-14',
      }),
    ]);
    const gate = container.querySelector('[data-orders-next-gate]');
    expect(gate).not.toHaveTextContent('Complete to produce');
  });

  // F2/F10 — a gate that can never seal is never a destination.
  it('never names Warehouse + site ready', () => {
    for (const status of ['in_production', 'shipped', 'delivered']) {
      const { container, unmount } = bookOf([
        po({ status, sent_at: '2026-05-03', delivered_date: '2026-06-14' }),
      ]);
      expect(
        container.querySelector('[data-orders-next-gate]'),
      ).not.toHaveTextContent('Warehouse + site ready');
      unmount();
    }
  });

  // F5 — Expected is a shipment expectation. A money date never renders here.
  it('shows the confirmed ETA as Expected', () => {
    const { container } = bookOf([
      po({ status: 'shipped', confirmed_eta: '2026-08-22' }),
    ]);
    expect(container.querySelector('[data-orders-expected]')).toHaveTextContent(
      '~22 August',
    );
  });

  it('NEVER renders a payment due date in Expected, and keeps the R18 unscheduled mark', () => {
    const { container } = bookOf([
      po({
        status: 'shipped',
        confirmed_eta: null,
        payments: [
          { kind: 'balance', state: 'due', due_date: '2026-07-01' },
          { kind: 'deposit', state: 'pending', due_date: '2026-06-01' },
        ],
      }),
    ]);
    const expected = container.querySelector('[data-orders-expected]');
    expect(expected).toHaveTextContent('NO DATE');
    expect(expected).toHaveAttribute('data-orders-unscheduled');
    expect(container.textContent).not.toMatch(/Jul 1|Jun 1/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C-11 (D1-11): money out on the Ledger — the bill run and the payment band.
// ══════════════════════════════════════════════════════════════════════════

describe('OrdersLedger · money out (C-11)', () => {
  const MONEY_ORDERS = [
    {
      ...ORDERS[0],
      payments: [{ id: 'pay-1', kind: 'deposit', state: 'due', amount_cents: 400_000 }],
    },
    {
      ...ORDERS[1],
      payments: [
        { id: 'pay-2', kind: 'deposit', state: 'due', amount_cents: 742_000 },
        { id: 'pay-3', kind: 'balance', state: 'pending', amount_cents: 100_000 },
      ],
    },
    {
      ...ORDERS[2],
      is_patina_catalog: true,
      payments: [{ id: 'pay-4', kind: 'full_upfront', state: 'paid', amount_cents: 84_000 }],
    },
  ];

  beforeEach(() => {
    mockUsePurchaseOrders.mockReturnValue({ data: MONEY_ORDERS, isLoading: false });
    mockUseVendors.mockReturnValue({ data: { data: VENDORS } });
    mockUseUpdatePurchaseOrderETA.mockReturnValue({ mutateAsync: mockMutateEta });
  });

  const billRun = () =>
    screen
      .getAllByTestId('front-matter')
      .find((el) => el.dataset.caption === 'due to makers this week');

  it('puts one bill-run total over exactly the rows the due lens shows', () => {
    const { container } = renderBook();
    expect(billRun()).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'due' }));
    expect(container.querySelectorAll('[data-orders-po-row]')).toHaveLength(2);
    // Only state 'due' rows count: the pending balance and the paid row do not.
    expect(billRun()).toHaveTextContent('$11,420 across 2 orders');

    // The project lens narrows the rows, and the total follows them.
    fireEvent.click(screen.getByRole('button', { name: 'Oak House' }));
    expect(container.querySelectorAll('[data-orders-po-row]')).toHaveLength(1);
    expect(billRun()).toHaveTextContent('$4,000 across 1 order');
  });

  it('unfolds the payment band from the row, catalog rows included', () => {
    renderBook();
    const toggles = screen.getAllByRole('button', { name: 'money out ↓' });
    expect(toggles).toHaveLength(3);

    fireEvent.click(toggles[0]);
    expect(screen.getByTestId('money-band')).toHaveTextContent('po-1');
    fireEvent.click(screen.getByRole('button', { name: 'money out ↑' }));
    expect(screen.queryByTestId('money-band')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'money out ↓' })[2]);
    expect(screen.getByTestId('money-band')).toHaveTextContent('po-3 · catalog');
  });
});

describe('OrdersLedger · held for release (C-32)', () => {
  const HELD_PO = {
    ...ORDERS[0],
    id: 'po-held',
    po_number: 'PO 1044',
    status: 'held_for_release',
    total_cents: 1_248_000,
    payments: [],
  };
  const held = (over: Record<string, unknown> = {}) => ({
    id: 'po-held',
    projectId: 'project-1',
    projectName: 'Oak House',
    studioId: 'org-studio',
    vendorName: 'Atelier One',
    totalCents: 1_248_000,
    heldAt: '2026-10-05T15:00:00Z',
    heldByName: 'Maya Okafor',
    holdNote: 'The walnut one.',
    viewerCanRelease: true,
    ...over,
  });
  const heldGroup = (container: HTMLElement) =>
    container.querySelector('[data-orders-held-for-release]');

  beforeEach(() => {
    mockUsePurchaseOrders.mockReturnValue({ data: [...ORDERS, HELD_PO], isLoading: false });
    mockUseVendors.mockReturnValue({ data: { data: VENDORS } });
    mockUseUpdatePurchaseOrderETA.mockReturnValue({ mutateAsync: mockMutateEta });
  });

  afterEach(() => {
    mockHeld.data = [];
  });

  it('leads the page with the orders this seat may release, each read once', () => {
    mockHeld.data = [held()];
    const { container } = renderBook();
    const group = heldGroup(container) as HTMLElement;
    expect(group).toHaveTextContent('Held for release · 1 · $12,480');
    expect(group).toHaveTextContent('Atelier One · Oak House');
    expect(group).toHaveTextContent(/\$12,480 · held .* · Maya/);
    expect(group).toHaveTextContent('“The walnut one.”');
    // It left the vendor group: three ordinary rows, no fourth.
    expect(container.querySelectorAll('[data-orders-po-row]')).toHaveLength(3);
  });

  it('is absent for a seat that cannot release; the order stays in its vendor group, opening on its paper', () => {
    mockHeld.data = [held({ viewerCanRelease: false })];
    const { container } = renderBook();
    expect(heldGroup(container)).toBeNull();
    expect(container.querySelectorAll('[data-orders-po-row]')).toHaveLength(4);
    expect(screen.getByText('held for release')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'open →' }));
    expect(screen.getByTestId('order-paper')).toHaveTextContent('Paper po-held');
  });

  it('opens the held order on its paper from the group', () => {
    mockHeld.data = [held()];
    const { container } = renderBook();
    const group = heldGroup(container) as HTMLElement;
    fireEvent.click(group.querySelector('[data-action-key="open-held-purchase-order"]') as HTMLElement);
    expect(screen.getByTestId('order-paper')).toHaveTextContent('Paper po-held');
  });

  it('honors the project lens', () => {
    mockHeld.data = [held()];
    const { container } = renderBook();
    fireEvent.click(screen.getByRole('button', { name: 'Lake House' }));
    expect(heldGroup(container)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Oak House' }));
    expect(heldGroup(container)).not.toBeNull();
  });
});

describe('OrdersLedger · Send the purchase order lands on its row (walk D3)', () => {
  // Lake House carries a drafted PO no Pieces line holds: the press arrives
  // here and lands on that row's own send act, never the book's head.
  const DRAFTED = {
    id: 'po-4',
    po_number: null,
    vendor_po_number: null,
    vendor_id: 'vendor-2',
    project_id: 'project-2',
    project: { id: 'project-2', name: 'Lake House' },
    total_cents: 340_000,
    status: 'draft',
    sent_at: null,
    acknowledged_at: null,
    confirmed_eta: null,
    is_patina_catalog: false,
    payments: [],
  };
  const lensed = { page: 'ledger', projectId: 'project-2' };

  beforeEach(() => {
    ordersSendLanding.pending = false;
    mockHeld.data = [];
    mockUsePurchaseOrders.mockReturnValue({ data: [...ORDERS, DRAFTED], isLoading: false });
    mockUseVendors.mockReturnValue({ data: { data: VENDORS } });
    mockUseUpdatePurchaseOrderETA.mockReturnValue({ mutateAsync: mockMutateEta });
  });

  const draftedSend = () =>
    [...document.querySelectorAll<HTMLElement>('[data-orders-po-row]')]
      .find((row) => row.textContent?.includes('send →'))
      ?.querySelector<HTMLElement>('[data-action-key="open-purchase-order-preview"]');

  it('spends the armed landing once the orders read, focusing the drafted row’s send →', async () => {
    mockUsePurchaseOrders.mockReturnValue({ data: undefined, isLoading: true });
    ordersSendLanding.pending = true;
    const { rerender } = render(<OrdersLedger onClose={jest.fn()} initialContext={lensed} />);
    // Still opening the book: the flag waits.
    expect(ordersSendLanding.pending).toBe(true);

    mockUsePurchaseOrders.mockReturnValue({ data: [...ORDERS, DRAFTED], isLoading: false });
    rerender(<OrdersLedger onClose={jest.fn()} initialContext={lensed} />);
    expect(ordersSendLanding.pending).toBe(false);
    // Lake House reads Atelier One's shipped row, then Atelier Two's
    // confirmed and drafted rows: the landing is the third row's act.
    expect(document.querySelectorAll('[data-orders-po-row]')).toHaveLength(3);
    const send = draftedSend();
    expect(send).toHaveTextContent('send →');
    await waitFor(() => expect(document.activeElement).toBe(send));
  });

  it('unarmed, the book opens without moving focus', async () => {
    render(<OrdersLedger onClose={jest.fn()} initialContext={lensed} />);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    expect(document.activeElement).toBe(document.body);
  });
});
