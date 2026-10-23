/**
 * C-12 · Vendors → Terms is the studio's own vendor account. The trade
 * discount is margin (C-36): it shows and saves only for a viewer who may see
 * the studio's margin, and a NULL from the read is hidden, never "0".
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VendorsBookPage, VendorAccountTerms, accountRequestFromForm } from './orders-book-vendors';

const mockUpsert = jest.fn();
let mockCanSeeMargin: boolean | null | undefined = false;
let mockAccount: Record<string, unknown> | null = null;

let mockOrderItems: Record<string, unknown>[] = [];
let mockOrderAuthority: Record<string, unknown> = { isSuccess: true, data: null };
let mockOrderAgreement: Record<string, unknown> = { isSuccess: true, data: { state: 'missing', evidence: null } };
let mockOrderInstruments: Record<string, unknown> = { isSuccess: true, data: [] };
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useQuery: () => ({ data: [] }),
  useQueries: ({ queries }: { queries: { queryKey: string[] }[] }) => queries.map(q =>
    q.queryKey[0] === 'project-purchasing-agreement' ? mockOrderAgreement :
    q.queryKey[0] === 'authority' ? mockOrderAuthority : mockOrderInstruments),
}));
jest.mock('./line-unfold/record-quote', () => ({ VendorRecordQuoteAct: () => null }));
jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(),
  useProcurementItems: () => ({ data: mockOrderItems }),
  useStudioVendorAccounts: () => ({ data: [] }),
  useCanSeeStudioMargin: () => ({ data: mockCanSeeMargin }),
  useStudioVendorAccount: () => ({ data: mockAccount, isLoading: false }),
  useStudioContacts: () => ({
    data: [
      { id: 'rep-1', entity_kind: 'person', full_name: 'Ada Rep' },
      { id: 'co-1', entity_kind: 'company', full_name: null },
    ],
  }),
  useStudioPaymentMethods: () => ({ data: [{ id: 'pm-1', label: 'Studio Amex' }] }),
  useUpsertStudioVendorAccount: () => ({ mutate: mockUpsert, isPending: false }),
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
  commercialDocumentKeys: { authority: (id: string) => ['authority', id], instruments: (id: string) => ['instruments', id] },
  fetchProjectBillingAuthority: jest.fn(),
}));

const vendor = {
  id: 'vendor-1',
  name: 'Hewn Woodworks',
  default_payment_terms: 'net_30',
  orders_email: 'orders@hewn.example',
};

const account = (over: Record<string, unknown> = {}) => ({
  id: 'acct-1',
  organization_id: 'studio-1',
  vendor_id: 'vendor-1',
  account_number: 'HW-204',
  rep_contact_id: 'rep-1',
  payment_pattern: 'thirty_seventy',
  deposit_pct: 30,
  net_days: null,
  payment_method_id: 'pm-1',
  transmission: 'email',
  orders_email_override: 'studio-orders@hewn.example',
  portal_url: null,
  lead_time_days: 42,
  claims_window_days: null,
  inspection_window_days: { parcel: 2 },
  resale_cert_on_file_on: null,
  notes: null,
  trade_discount_pct: 12,
  archived_at: null,
  ...over,
});

beforeEach(() => {
  mockUpsert.mockReset();
  mockCanSeeMargin = false;
  mockAccount = null;
});

describe('VendorAccountTerms — the studio account on Terms (C-12)', () => {
  it('shows stored claim windows and marks missing terms as unknown', () => {
    mockAccount = account();
    render(<VendorAccountTerms vendor={vendor} />);
    expect(screen.getByText('HW-204')).toBeTruthy();
    expect(screen.getByText('Ada Rep')).toBeTruthy();
    expect(screen.getByText('thirty seventy · 30% deposit')).toBeTruthy();
    expect(screen.getByText('Email · studio-orders@hewn.example')).toBeTruthy();
  });

  it('falls back to the shared vendor default when the studio has no account', () => {
    render(<VendorAccountTerms vendor={vendor} />);
    expect(screen.getByText('net 30 (vendor default)')).toBeTruthy();
    expect(screen.getByRole('button', { name: /set up the account/i })).toBeTruthy();
  });

  it.each([false, null, undefined])(
    'hides the trade discount from a viewer who may not see margin (canSeeMargin=%s)',
    (canSee) => {
      mockCanSeeMargin = canSee;
      mockAccount = account({ trade_discount_pct: null });
      render(<VendorAccountTerms vendor={vendor} />);
      expect(screen.queryByText('Trade discount')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /edit the account/i }));
      expect(screen.queryByLabelText(/trade discount/i)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /^save vendor account$/i }));
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      expect(mockUpsert.mock.calls[0][0].request).not.toHaveProperty('tradeDiscountPct');
    },
  );

  it('shows a NULL discount as unset, never zero, to a margin viewer', () => {
    mockCanSeeMargin = true;
    mockAccount = account({ trade_discount_pct: null });
    render(<VendorAccountTerms vendor={vendor} />);
    expect(screen.getByText('Trade discount')).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('shows and saves the trade discount for a margin viewer', async () => {
    mockCanSeeMargin = true;
    mockAccount = account();
    render(<VendorAccountTerms vendor={vendor} />);
    expect(screen.getByText('12%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /edit the account/i }));
    const discount = screen.getByLabelText(/trade discount/i) as HTMLInputElement;
    expect(discount.value).toBe('12');
    fireEvent.change(discount, { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/concealed damage/i), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /^save vendor account$/i }));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(1));
    const { organizationId, vendorId, request } = mockUpsert.mock.calls[0][0];
    expect(organizationId).toBe('studio-1');
    expect(vendorId).toBe('vendor-1');
    expect(request.tradeDiscountPct).toBe(15);
    expect(request.inspectionWindowDays).toEqual({ parcel: 2, concealed_carrier: 7 });
    expect(request.ordersEmailOverride).toBe('studio-orders@hewn.example');
  });

  it('shows unknown claim windows without inventing values and uses neutral placeholders', () => {
    mockAccount = account();
    render(<VendorAccountTerms vendor={vendor} />);
    expect(screen.getByText('vendor window unknown · concealed damage window unknown — add vendor terms')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /edit the account/i }));
    expect((screen.getByLabelText(/vendor claims/i) as HTMLInputElement).placeholder).toBe('Add vendor terms');
    expect((screen.getByLabelText(/concealed damage/i) as HTMLInputElement).placeholder).toBe('Add vendor terms');
  });

  it('refuses a malformed orders email inline, without saving', () => {
    render(<VendorAccountTerms vendor={vendor} />);
    fireEvent.click(screen.getByRole('button', { name: /set up the account/i }));
    fireEvent.change(screen.getByLabelText(/orders email/i), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: /^save vendor account$/i }));
    expect(screen.getByRole('alert').textContent).toMatch(/orders email/i);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe('accountRequestFromForm', () => {
  const blank = {
    accountNumber: '',
    repContactId: '',
    paymentPattern: '',
    depositPct: '',
    netDays: '',
    paymentMethodId: '',
    transmission: '',
    ordersEmailOverride: '',
    portalUrl: '',
    leadTimeDays: '',
    claimsWindowDays: '',
    concealedCarrierDays: '',
    resaleCertOnFileOn: '',
    notes: '',
    tradeDiscountPct: '9',
  };

  it('clears blanks to null and drops a cleared concealed-carrier window', () => {
    const out = accountRequestFromForm(blank, account({ inspection_window_days: { concealed_carrier: 9 } }) as never, false);
    expect('request' in out && out.request).toMatchObject({
      accountNumber: null,
      claimsWindowDays: null,
      inspectionWindowDays: null,
    });
    expect('request' in out && out.request).not.toHaveProperty('tradeDiscountPct');
  });

  it('rejects a non-number', () => {
    expect(accountRequestFromForm({ ...blank, netDays: 'thirty' }, null, false)).toEqual({
      error: 'Net days must be a number.',
    });
  });
});


describe('Orders book external agreement purchase gate', () => {
  beforeEach(() => {
    mockOrderAuthority = { isSuccess: true, data: null };
    mockOrderAgreement = { isSuccess: true, data: { state: 'external_recorded', evidence: { id: 'evidence' } } };
    mockOrderInstruments = { isSuccess: true, data: [] };
    mockOrderItems = [{ id: 'line-1', project_id: 'project-1', name: 'Chair', status: 'specified', design_disposition: 'selected', quantity: 1,
      unit_price_cents: 10000, trade_price_cents: 7000, line_total_cents: 10000, vendor_id: vendor.id, vendor_name: vendor.name }];
  });
  const openOrders = () => render(<VendorsBookPage vendors={[vendor]} orders={[]} initialVendorId={vendor.id}
    initialVendorPage="orders" briefProjectId={null} canSeePoMoney={() => true} onOpenDocument={jest.fn()} />);
  it('never offers a legacy direct PO for an external-recorded unauthorized line', () => {
    openOrders();
    expect(screen.queryByRole('button', { name: /Order all/ })).toBeNull();
    expect(screen.queryByText(/You can still order/)).toBeNull();
  });
  it.each(['loading', 'error'])('holds Orders during purchasing agreement %s', (state) => {
    mockOrderAgreement = { ...mockOrderAgreement, isSuccess: false, isPending: state === 'loading', isError: state === 'error' };
    openOrders(); expect(screen.queryByRole('button', { name: /Order all/ })).toBeNull();
  });
  it('retains the truly legacy direct PO control', () => {
    mockOrderAgreement = { isSuccess: true, data: { state: 'missing', evidence: null } };
    openOrders(); expect(screen.getByRole('button', { name: /Order all/ })).toBeInTheDocument();
    expect(screen.getByText(/You can still order/)).toBeInTheDocument();
  });
});
