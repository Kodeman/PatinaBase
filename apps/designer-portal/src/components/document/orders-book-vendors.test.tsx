/**
 * C-12 · Vendors → Terms is the studio's own vendor account. The trade
 * discount is margin (C-36): it shows and saves only for a viewer who may see
 * the studio's margin, and a NULL from the read is hidden, never "0".
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VendorAccountTerms, accountRequestFromForm } from './orders-book-vendors';

const mockUpsert = jest.fn();
let mockCanSeeMargin: boolean | null | undefined = false;
let mockAccount: Record<string, unknown> | null = null;

jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(),
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

jest.mock('@/components/portal/procurement/order-assistant', () => ({
  OrderAssistant: () => null,
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: {},
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
  it('reads the account: terms, rep, override inbox, and the R-PB9 claim defaults', () => {
    mockAccount = account();
    render(<VendorAccountTerms vendor={vendor} />);
    expect(screen.getByText('HW-204')).toBeTruthy();
    expect(screen.getByText('Ada Rep')).toBeTruthy();
    expect(screen.getByText('thirty seventy · 30% deposit')).toBeTruthy();
    expect(screen.getByText('Email · studio-orders@hewn.example')).toBeTruthy();
    expect(screen.getByText('vendor 3 days · concealed damage 5 days')).toBeTruthy();
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
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(1));
    const { organizationId, vendorId, request } = mockUpsert.mock.calls[0][0];
    expect(organizationId).toBe('studio-1');
    expect(vendorId).toBe('vendor-1');
    expect(request.tradeDiscountPct).toBe(15);
    expect(request.inspectionWindowDays).toEqual({ parcel: 2, concealed_carrier: 7 });
    expect(request.ordersEmailOverride).toBe('studio-orders@hewn.example');
  });

  it('shows the claim-window defaults as placeholders while editing', () => {
    render(<VendorAccountTerms vendor={vendor} />);
    fireEvent.click(screen.getByRole('button', { name: /set up the account/i }));
    expect((screen.getByLabelText(/vendor claims/i) as HTMLInputElement).placeholder).toBe(
      '3 (72 h default)',
    );
    expect((screen.getByLabelText(/concealed damage/i) as HTMLInputElement).placeholder).toBe(
      '5 (5 d default)',
    );
  });

  it('refuses a malformed orders email inline, without saving', () => {
    render(<VendorAccountTerms vendor={vendor} />);
    fireEvent.click(screen.getByRole('button', { name: /set up the account/i }));
    fireEvent.change(screen.getByLabelText(/orders email/i), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
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
