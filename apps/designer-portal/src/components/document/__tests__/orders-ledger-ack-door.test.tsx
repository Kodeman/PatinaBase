/**
 * US-19 FR7 F7-8 (one door per surface): on the Orders ledger `log ack ↓` is
 * the door. Under `one-voice` pressing it opens the acknowledgment check
 * straight in — focus on Their order № — with no second door. The real
 * LogAckInline and AckCheckForm render here; the ledger's register is
 * proven in ../orders-ledger.test.tsx.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  usePurchaseOrders: () => ({
    data: [
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
    ],
    isLoading: false,
  }),
  useUpdatePurchaseOrderETA: () => ({ mutateAsync: jest.fn() }),
  useVendors: () => ({ data: { data: [{ id: 'vendor-1', name: 'Atelier One' }] } }),
  useHeldPurchaseOrders: () => ({ data: [] }),
  // The acknowledgment check's reads: nothing acknowledged yet.
  isChangeOrderRequired: () => false,
  poAckBasisKey: (id: string) => ['buying-phase2', 'ack-basis', id],
  useLogPoAcknowledgment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useResolveAckLine: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePoAckBasis: () => ({ data: undefined, isLoading: false, isError: false }),
  usePoAcknowledgments: () => ({ data: [] }),
  usePoCostLines: () => ({ data: [] }),
  useVendorQuotes: () => ({ data: [] }),
  useProcurementDrafts: () => ({ data: [] }),
}));

let mockOneVoice = false;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({ value: name === 'one-voice' && mockOneVoice, isLoading: false }),
}));

jest.mock('@/lib/analytics/procurement-events', () => ({
  procurementEvents: { poSent: jest.fn(), poAcknowledgmentLogged: jest.fn() },
}));

jest.mock('@/components/portal/procurement/order-paper', () => ({
  ExistingOrderPaper: () => null,
}));

jest.mock('@/components/portal/procurement/po-send-actions', () => ({
  clientVendorEmailHint: () => 'orders@example.com',
  poSendErrorMessage: () => '',
}));

jest.mock('../stamp', () => ({
  Stamp: ({ label }: { label: string }) => <span>{label}</span>,
}));

// The paper is not opened here; LogAckInline is the real one.
jest.mock('../po-preview', () => ({
  ...jest.requireActual('../po-preview'),
  PoPreview: () => null,
}));

jest.mock('../ledger-front-matter', () => ({
  LedgerFrontMatter: () => null,
  dueToMakers: jest.requireActual('../ledger-front-matter').dueToMakers,
}));

jest.mock('../line-unfold/record-payment', () => ({
  PoMoneyOut: () => null,
}));

jest.mock('../date-text-input', () => ({
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

jest.mock('../orders-book-vendors', () => ({ VendorsBookPage: () => null }));
jest.mock('../orders-book-week', () => ({ WeekBookPage: () => null }));
jest.mock('../orders-book-receiving', () => ({ ReceivingBookPage: () => null }));

jest.mock('../overlays/doc-sheet', () => ({
  DocSheetHead: ({ title, pageLabel }: { title: string; pageLabel: string }) => (
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

jest.mock('../document-action', () => ({
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
  DocumentActionGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { OrdersLedger } from '../orders-ledger';

beforeEach(() => {
  mockOneVoice = false;
});

describe('OrdersLedger · log ack is the door (US-19 F7-8)', () => {
  it('under one-voice opens the form straight in, focused on Their order №, with no second door', async () => {
    mockOneVoice = true;
    render(<OrdersLedger onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'log ack ↓' }));

    const theirOrder = screen.getByRole('textbox', { name: 'Their order №' });
    await waitFor(() => expect(document.activeElement).toBe(theirOrder));
    expect(screen.queryByTestId('ack-check-door')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log what they confirmed' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'log ack ↑' })).toBeInTheDocument();
  });

  it('flag off opens the form as today, without taking focus', () => {
    render(<OrdersLedger onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'log ack ↓' }));
    const theirOrder = screen.getByRole('textbox', { name: 'Their order №' });
    expect(screen.queryByTestId('ack-check-door')).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(theirOrder);
  });
});
