/**
 * The receiving photo line, at both call sites (Wave 1P, Task 6).
 *
 * The sibling suite tests `inspectionPhotoLine` as a pure function. This one renders
 * ReceivingBookPage, so a regression at either call site — the open-claim row or the
 * Settled fold — is actually caught. (The useDamageClaims select string itself is pinned
 * in packages/supabase's use-procurement suite, not here — this file mocks that hook.)
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReceivingBookPage } from '../orders-book-receiving';

let orders: any[] = [];
let inspections: any[] = [];
let draftedClaims: any[] = [];
let notifiedClaims: any[] = [];

jest.mock('@patina/supabase', () => ({
  usePurchaseOrders: () => ({ data: orders, isLoading: false }),
  useReceivingInspections: () => ({ data: inspections, isLoading: false }),
  useDamageClaims: ({ state }: { state: string }) => ({
    data: state === 'drafted' ? draftedClaims : notifiedClaims,
  }),
  useUpdateDamageClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/components/portal/procurement/log-inspection-drawer', () => ({
  LogInspectionDrawer: () => null,
}));
jest.mock('@/lib/document/ledger-summary', () => ({
  receivingFrontMatter: () => [],
}));

function inspection(over: Record<string, unknown> = {}) {
  return {
    id: 'insp-1',
    purchase_order_id: 'po-1',
    inspected_at: '2026-08-20T00:00:00Z',
    outcome: 'clean',
    photo_asset_ids: [],
    purchase_order: {
      id: 'po-1',
      vendor: { id: 'v-1', name: 'Ellsworth Mill' },
      project: { id: 'proj-1', name: 'Maple St' },
    },
    ...over,
  };
}

function claim(over: Record<string, unknown> = {}) {
  return {
    id: 'claim-1',
    state: 'drafted',
    description: 'Chip on the canopy.',
    created_at: '2026-08-20T00:00:00Z',
    vendor_notified_at: null,
    inspection: {
      id: 'insp-2',
      purchase_order_id: 'po-2',
      outcome: 'damaged',
      photo_asset_ids: ['a', 'b', 'c'],
      purchase_order: {
        id: 'po-2',
        vendor: { id: 'v-1', name: 'Ellsworth Mill' },
        project: { id: 'proj-1', name: 'Maple St' },
      },
    },
    ...over,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReceivingBookPage onOpenDocument={jest.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  orders = [];
  inspections = [];
  draftedClaims = [];
  notifiedClaims = [];
});

describe('the receiving photo line, rendered', () => {
  it('shows the count on an open claim whose inspection carries photos', () => {
    draftedClaims = [claim()];
    renderPage();
    expect(screen.getByText(/3 photos logged on the phone/)).toBeInTheDocument();
  });

  it('says nothing on an open claim whose inspection carries none', () => {
    draftedClaims = [claim({ inspection: { ...claim().inspection, photo_asset_ids: [] } })];
    renderPage();
    expect(screen.queryByText(/logged on the phone/)).toBeNull();
  });

  it('shows the count in the Settled fold once it is opened', () => {
    inspections = [inspection({ photo_asset_ids: ['x', 'y'] })];
    renderPage();

    // The fold is collapsed by default — nothing is asserted until it is opened.
    expect(screen.queryByText(/logged on the phone/)).toBeNull();
    fireEvent.click(screen.getByText(/Settled ·/));
    expect(screen.getByText(/2 photos logged on the phone/)).toBeInTheDocument();
  });

  it('leaves a cleared inspection with no photos unannotated in the fold', () => {
    inspections = [inspection({ photo_asset_ids: [] })];
    renderPage();
    fireEvent.click(screen.getByText(/Settled ·/));
    expect(screen.queryByText(/logged on the phone/)).toBeNull();
  });
});
