/**
 * US-19 FR4 Fix 3 (520-4) — `File the claim` at PO grain opens the Orders
 * ledger on Receiving, and the page lands focus on the claim card's own act:
 * `Notify vendor` while the claim is drafted, `Mark resolved` once the vendor
 * is told. The ledger with nothing focused is never the landing. Without the
 * landing armed, opening Receiving moves no focus.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReceivingBookPage, receivingClaimLanding } from '../orders-book-receiving';

let draftedClaims: Record<string, unknown>[] = [];
let notifiedClaims: Record<string, unknown>[] = [];
let claimsLoading = false;

jest.mock('@patina/supabase', () => ({
  usePurchaseOrders: () => ({ data: [], isLoading: false }),
  useUnresolvedProcurementExceptions: () => ({ data: [] }),
  useOpenProcurementException: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useReceivingInspections: () => ({ data: [], isLoading: false }),
  useDamageClaims: ({ state }: { state: string }) => ({
    data: claimsLoading ? undefined : state === 'drafted' ? draftedClaims : notifiedClaims,
    isLoading: claimsLoading,
  }),
  useUpdateDamageClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('../line-unfold/claim-clock', () => ({ ClaimClockLine: () => null }));
jest.mock('@/components/portal/procurement/log-inspection-drawer', () => ({
  LogInspectionDrawer: () => null,
}));
jest.mock('@/lib/document/ledger-summary', () => ({ receivingFrontMatter: () => [] }));

function claim(id: string, state: string) {
  return {
    id,
    state,
    description: 'Cracked leg.',
    created_at: '2026-10-01T00:00:00Z',
    vendor_notified_at: state === 'vendor_notified' ? '2026-10-02T00:00:00Z' : null,
    exception_id: 'exc-1',
    inspection: {
      id: `insp-${id}`,
      purchase_order_id: 'po-1',
      outcome: 'damaged',
      photo_asset_ids: [],
      purchase_order: {
        id: 'po-1',
        project_id: 'olsen',
        vendor: { id: 'v-1', name: 'Ellsworth Mill' },
        project: { id: 'olsen', name: 'Olsen' },
      },
    },
  };
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const page = () => (
  <QueryClientProvider client={client}>
    <ReceivingBookPage projectId="olsen" onOpenDocument={jest.fn()} />
  </QueryClientProvider>
);
const renderPage = () => render(page());

beforeEach(() => {
  draftedClaims = [];
  notifiedClaims = [];
  claimsLoading = false;
  receivingClaimLanding.pending = false;
});

describe('File the claim lands on the Receiving claim card’s act (520-4)', () => {
  it('a drafted claim: focus on Notify vendor, and the landing is spent', async () => {
    draftedClaims = [claim('claim-1', 'drafted')];
    receivingClaimLanding.pending = true;
    renderPage();

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Notify vendor' })),
    );
    expect(receivingClaimLanding.pending).toBe(false);
  });

  it('a claim the vendor has been told of: focus on Mark resolved', async () => {
    notifiedClaims = [claim('claim-2', 'vendor_notified')];
    receivingClaimLanding.pending = true;
    renderPage();

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mark resolved' })),
    );
  });

  it('waits for the claims to read before it lands', async () => {
    claimsLoading = true;
    receivingClaimLanding.pending = true;
    const { rerender } = renderPage();
    expect(receivingClaimLanding.pending).toBe(true);

    claimsLoading = false;
    draftedClaims = [claim('claim-1', 'drafted')];
    rerender(page());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Notify vendor' })),
    );
  });

  it('opened any other way, Receiving moves no focus', async () => {
    draftedClaims = [claim('claim-1', 'drafted')];
    renderPage();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(document.activeElement).toBe(document.body);
  });
});
