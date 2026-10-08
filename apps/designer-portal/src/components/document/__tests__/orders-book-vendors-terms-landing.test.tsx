/**
 * US-19 FR3 F3-22 (517-1): `Add an address` lands on the vendor page's
 * `terms` sub-page, not the default `thread`, with focus on the Orders email —
 * the address a maker's note goes to. Without the landing the page opens as
 * before (thread) and nothing takes focus.
 */
import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(),
  useCanSeeStudioMargin: () => ({ data: false }),
  useStudioVendorAccount: () => ({ data: null, isLoading: false }),
  useStudioVendorAccounts: () => ({ data: [] }),
  useStudioContacts: () => ({ data: [] }),
  useStudioPaymentMethods: () => ({ data: [] }),
  useUpsertStudioVendorAccount: () => ({ mutate: jest.fn(), isPending: false }),
  useStartVendorBrief: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-viewer-studio', () => ({
  useInternalTimeStudio: () => ({ studio: { id: 'studio-1' } }),
}));
jest.mock('@/components/portal/procurement/order-paper', () => ({
  OrderPaperQueue: () => null,
  PAYMENT_PATTERN_OPTIONS: jest.requireActual('@/components/portal/procurement/order-paper/model')
    .PAYMENT_PATTERN_OPTIONS,
}));
jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: {},
  fetchProjectBillingAuthority: jest.fn(),
}));
jest.mock('../line-unfold/sample-request', () => ({ VendorSamples: () => null }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import { VendorsBookPage } from '../orders-book-vendors';

const VENDOR = {
  id: 'vendor-hewn',
  name: 'Hewn Woodworks',
  default_payment_terms: 'net_30',
  orders_email: null,
  contact_profile_id: null,
  is_patina_catalog: true,
};

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const page = (props: Partial<Parameters<typeof VendorsBookPage>[0]> = {}) => (
  <VendorsBookPage
    vendors={[VENDOR]}
    orders={[]}
    initialVendorId="vendor-hewn"
    briefProjectId={null}
    onOpenDocument={jest.fn()}
    {...props}
  />
);

describe('VendorsBookPage — the Add an address landing (517-1)', () => {
  it('opens on terms with focus on the Orders email field', async () => {
    renderWithQuery(page({ initialVendorPage: 'terms', focusField: 'orders-email' }));
    expect(screen.getByRole('button', { name: /^Terms/ })).toHaveAttribute('aria-current', 'page');
    const field = await screen.findByLabelText('Orders email');
    await waitFor(() => expect(field).toHaveFocus());
  });

  it('the landing is spent once the designer moves: back on terms, the account reads, unedited', async () => {
    renderWithQuery(page({ initialVendorPage: 'terms', focusField: 'orders-email' }));
    await waitFor(() => expect(screen.getByLabelText('Orders email')).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Thread' }));
    fireEvent.click(screen.getByRole('button', { name: /^Terms/ }));
    expect(screen.queryByLabelText('Orders email')).toBeNull();
    expect(screen.getByRole('button', { name: /set up the account/i })).toBeInTheDocument();
  });

  it('without the landing the vendor opens on thread, as before', () => {
    renderWithQuery(page());
    expect(screen.getByRole('button', { name: 'Thread' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByLabelText('Orders email')).toBeNull();
  });
});
