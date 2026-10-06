/**
 * C-30: the overlay as printed — the studio row (type · status, clock, act)
 * and the maker lane's one read-only line with no money (V1).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockExceptions: { data: Record<string, unknown>[] } = { data: [] };
function mockMutation() {
  return { mutateAsync: jest.fn(), isPending: false };
}

jest.mock('@patina/supabase', () => ({
  invalidateProcurementExceptions: jest.fn(),
  useUnresolvedProcurementExceptions: () => ({ data: mockExceptions.data }),
  useOpenProcurementException: () => mockMutation(),
  useResolveProcurementException: () => mockMutation(),
  useStartPurchaseOrderChange: () => mockMutation(),
  useRecordVendorRefund: () => mockMutation(),
  useComposeProcurementDraft: () => mockMutation(),
  useRequestSubstitutionApproval: () => mockMutation(),
  usePublishDraftDecision: () => mockMutation(),
  useTriageProjectFfeItems: () => mockMutation(),
  useProcurementDrafts: () => ({ data: [] }),
  useProjectFFEItems: () => ({ data: [] }),
  useDecision: () => ({ data: null }),
  useProjectRecordedStudio: () => ({ data: null }),
  useCanSeeStudioMargin: () => false,
  useVendor: () => ({ data: null }),
}));
jest.mock('@/components/portal/procurement/order-paper', () => ({ OrderPaper: () => null }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import { ExceptionRow, LineExceptions } from '../exception-overlay';

const wrap = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

function row(partial: Record<string, unknown> = {}) {
  return {
    id: 'x1',
    project_id: 'p1',
    type: 'damage',
    status: 'open',
    ffe_item_id: 'item-1',
    purchase_order_id: 'po-1',
    inspection_id: null,
    damage_claim_id: null,
    clock_due_on: '2099-01-08',
    clock_basis: 'Hewn wants written notice within 3 days of delivery.',
    client_decision_id: null,
    po_change_id: null,
    note: null,
    purchase_order: {
      id: 'po-1',
      po_number: 'PO-101',
      vendor_po_number: null,
      sidemark: null,
      is_patina_catalog: false,
      vendor_id: 'v1',
      vendor: { name: 'Hewn' },
    },
    ffe_item: { id: 'item-1', name: 'Walnut console' },
    ...partial,
  } as never;
}

const catalogRow = () =>
  row({
    purchase_order: {
      id: 'po-1',
      po_number: 'PO-101',
      vendor_po_number: null,
      sidemark: null,
      is_patina_catalog: true,
      vendor_id: 'v1',
      vendor: { name: 'Hewn' },
    },
  });

beforeEach(() => {
  mockExceptions.data = [];
});

describe('ExceptionRow', () => {
  it('prints type · status, the dated clock with its basis, and "Choose a path"', () => {
    const onChoose = jest.fn();
    render(<ExceptionRow exception={row()} makerLane={false} onChoose={onChoose} />);
    expect(screen.getByText(/Damage · open/)).toBeInTheDocument();
    expect(screen.getByTestId('exception-clock')).toHaveTextContent(
      /^By .+\. Hewn wants written notice within 3 days of delivery\.$/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a path' }));
    expect(onChoose).toHaveBeenCalled();
  });

  it('offers no act for an ack discrepancy (answered in the acknowledgment)', () => {
    render(<ExceptionRow exception={row({ type: 'ack_discrepancy' })} makerLane={false} onChoose={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Choose a path' })).toBeNull();
  });

  it('on the maker lane reads one line, no act, no clock, no money', () => {
    const { container } = render(
      <ExceptionRow exception={catalogRow()} makerLane onChoose={jest.fn()} />,
    );
    expect(screen.getByTestId('exception-maker-lane')).toHaveTextContent(
      'Damage · Patina is handling it with the maker',
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('exception-clock')).toBeNull();
    expect(container.textContent).not.toMatch(/\$/);
  });
});

describe('LineExceptions — the unfold band', () => {
  const item = { id: 'item-1', name: 'Walnut console', status: 'ordered', purchase_order: { id: 'po-1' }, item_claims: [] };

  it('shows the studio row and "Something’s wrong…"', () => {
    mockExceptions.data = [row()];
    render(<LineExceptions item={item} projectId="p1" />, { wrapper: wrap });
    expect(screen.getByTestId('exception-row')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Something’s wrong…' })).toBeInTheDocument();
  });

  it('is read-only on the maker lane', () => {
    mockExceptions.data = [catalogRow()];
    render(
      <LineExceptions
        item={{ ...item, item_claims: [{ id: 'claim-1', state: 'drafted' }] }}
        projectId="p1"
      />,
      { wrapper: wrap },
    );
    expect(screen.getByTestId('exception-maker-lane')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers to track an open claim that has no exception yet', () => {
    render(
      <LineExceptions
        item={{ ...item, item_claims: [{ id: 'claim-1', state: 'drafted' }] }}
        projectId="p1"
      />,
      { wrapper: wrap },
    );
    expect(screen.getByText('A damage claim with no clock yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Track it' })).toBeInTheDocument();
  });

  it('SQ-448: never offers "Track it" on a catalog-lane claim, even before any exception exists', () => {
    render(
      <LineExceptions
        item={{
          ...item,
          purchase_order: { id: 'po-1', is_patina_catalog: true },
          item_claims: [{ id: 'claim-1', state: 'drafted' }],
        }}
        projectId="p1"
      />,
      { wrapper: wrap },
    );
    expect(screen.queryByRole('button', { name: 'Track it' })).toBeNull();
    expect(screen.queryByText('A damage claim with no clock yet.')).toBeNull();
  });
});
