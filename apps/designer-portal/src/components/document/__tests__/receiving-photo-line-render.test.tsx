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
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        success: true,
        data: { downloadUrl: `https://r2.test/signed/${String(url).split('/')[4]}` },
      }),
    })) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('shows the count on an open claim whose inspection carries photos', () => {
    draftedClaims = [claim()];
    renderPage();
    expect(screen.getByText(/3 photos/)).toBeInTheDocument();
  });

  it('shows the inspection photo strip on an open claim (C-19)', async () => {
    draftedClaims = [claim()];
    renderPage();
    expect(await screen.findByAltText('Inspection photo 1 of 3')).toHaveAttribute(
      'src',
      'https://r2.test/signed/a',
    );
    expect(screen.getByAltText('Inspection photo 3 of 3')).toHaveAttribute(
      'src',
      'https://r2.test/signed/c',
    );
  });

  it('says nothing on an open claim whose inspection carries none', () => {
    draftedClaims = [claim({ inspection: { ...claim().inspection, photo_asset_ids: [] } })];
    renderPage();
    expect(screen.queryByText(/\d photos?/)).toBeNull();
    expect(screen.queryByTestId('inspection-photo-strip')).toBeNull();
  });

  it('shows the count in the Settled fold once it is opened', () => {
    inspections = [inspection({ photo_asset_ids: ['x', 'y'] })];
    renderPage();

    // The fold is collapsed by default — nothing is asserted until it is opened.
    expect(screen.queryByText(/2 photos/)).toBeNull();
    fireEvent.click(screen.getByText(/Settled ·/));
    expect(screen.getByText(/2 photos/)).toBeInTheDocument();
  });

  it('leaves a cleared inspection with no photos unannotated in the fold', () => {
    inspections = [inspection({ photo_asset_ids: [] })];
    renderPage();
    fireEvent.click(screen.getByText(/Settled ·/));
    expect(screen.queryByText(/\d photos?/)).toBeNull();
  });

  it('lists shipped POs as receivable apart from the delivered queue (C-19 carry-in)', () => {
    orders = [
      {
        id: 'po-d',
        status: 'delivered',
        po_number: 'PO-D',
        vendor: { name: 'Ellsworth Mill' },
        project: { id: 'proj-1', name: 'Maple St' },
      },
      {
        id: 'po-s',
        status: 'shipped',
        po_number: 'PO-S',
        confirmed_eta: '2026-10-08',
        vendor: { name: 'Ellsworth Mill' },
        project: { id: 'proj-1', name: 'Maple St' },
      },
    ];
    renderPage();
    expect(screen.getByText(/Awaiting inspection · 1/)).toBeInTheDocument();
    expect(screen.getByText(/Shipped · receive on arrival · 1/)).toBeInTheDocument();
    expect(screen.getByText(/PO-S/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Inspect' })).toHaveLength(2);
  });
});
