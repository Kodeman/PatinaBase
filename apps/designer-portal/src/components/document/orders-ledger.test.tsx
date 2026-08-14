import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  usePurchaseOrders,
  useUpdatePurchaseOrderETA,
  useVendors,
} from '@patina/supabase';
import { OrdersLedger } from './orders-ledger';

const mockPush = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockMutateEta = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('@patina/supabase', () => ({
  usePurchaseOrders: jest.fn(),
  useUpdatePurchaseOrderETA: jest.fn(),
  useVendors: jest.fn(),
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
  LedgerFrontMatter: () => <div data-testid="front-matter" />,
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
  WeekBookPage: () => <div>Week page</div>,
}));

jest.mock('./orders-book-receiving', () => ({
  ReceivingBookPage: () => <div>Receiving page</div>,
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
      '~Aug 22',
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
