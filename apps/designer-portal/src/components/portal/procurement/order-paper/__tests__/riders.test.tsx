/**
 * C-26 riders: R-PB7's default (bill the client at cost, on its own line),
 * the per-line override, payees other than the vendor, and the rider's own
 * "Record payment" act through P1-5's unscheduled-payment flow.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockUpsert = jest.fn();
const mockRecordPayment = jest.fn();
const mockLines: { data: unknown[] } = { data: [] };

jest.mock('@patina/supabase', () => ({
  usePoCostLines: (poId: string | null) => ({ data: poId ? mockLines.data : undefined }),
  useUpsertPoCostLine: () => ({ mutateAsync: mockUpsert, isPending: false }),
  useStudioIdentity: () => ({ data: { studioId: 'org-studio' } }),
  useStudioContacts: () => ({
    data: [
      { id: 'contact-badger', company_name: 'Badger Receiving', full_name: null },
      { id: 'contact-estes', company_name: null, full_name: 'Estes Express' },
    ],
  }),
  useRecordVendorPayment: () => ({ mutateAsync: mockRecordPayment, isPending: false }),
  useStudioPaymentMethods: () => ({ data: [] }),
}));
jest.mock('@/hooks/use-folio', () => ({
  useUploadFolioFile: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import { PoRiders } from '../riders';
import {
  freshRider,
  parseRiderCents,
  paysSomeoneElse,
  riderBillingText,
  riderCreateRequest,
} from '../riders-model';

const VENDOR = { id: 'vendor-hale', name: 'Hale Upholstery' };

const line = (over: Record<string, unknown> = {}) => ({
  id: 'rider-1',
  purchase_order_id: 'po-1',
  kind: 'freight',
  payee_vendor_id: 'vendor-hale',
  payee_contact_id: null,
  estimate_cents: 42000,
  actual_cents: null,
  billable_to_client: true,
  billing_rule: 'at_cost',
  invoice_line_id: null,
  note: null,
  ...over,
});

beforeEach(() => {
  mockUpsert.mockReset().mockResolvedValue({ purchase_order_id: 'po-1' });
  mockRecordPayment.mockReset().mockResolvedValue({});
  mockLines.data = [];
});

describe('rider defaults (R-PB7)', () => {
  it('a new rider is freight to the vendor, billed to the client at cost', () => {
    expect(freshRider()).toEqual({
      kind: 'freight',
      estimate: '',
      payee: 'vendor',
      billable: true,
      billingRule: 'at_cost',
    });
    expect(riderCreateRequest({ ...freshRider(), estimate: '420' }, VENDOR.id)).toEqual({
      kind: 'freight',
      payeeVendorId: VENDOR.id,
      payeeContactId: null,
      estimateCents: 42000,
      billableToClient: true,
      billingRule: 'at_cost',
    });
  });

  it('a blank estimate is no figure yet; a non-amount is refused', () => {
    expect(parseRiderCents('')).toBeNull();
    expect(parseRiderCents('$1,250.50')).toBe(125050);
    expect(parseRiderCents('abc')).toBeUndefined();
    expect(riderCreateRequest({ ...freshRider(), estimate: 'abc' }, VENDOR.id)).toBeNull();
  });

  it('a contact payee clears the vendor payee', () => {
    const request = riderCreateRequest(
      { ...freshRider(), kind: 'receiving', payee: 'contact:contact-badger' },
      VENDOR.id,
    );
    expect(request).toMatchObject({ payeeVendorId: null, payeeContactId: 'contact-badger' });
  });

  it('reads the billing fact, and a billed rider says so', () => {
    expect(riderBillingText(line() as never)).toBe('bill the client at cost');
    expect(riderBillingText(line({ billing_rule: 'cost_plus' }) as never)).toBe(
      'bill the client, cost plus',
    );
    expect(riderBillingText(line({ billable_to_client: false }) as never)).toBe(
      'not billed to the client',
    );
    expect(riderBillingText(line({ invoice_line_id: 'inv-line' }) as never)).toBe(
      'billed to the client',
    );
  });

  it('only a rider owed to someone other than the vendor is paid on its own', () => {
    expect(paysSomeoneElse(line() as never, VENDOR.id)).toBe(false);
    expect(paysSomeoneElse(line({ payee_vendor_id: null }) as never, VENDOR.id)).toBe(false);
    expect(
      paysSomeoneElse(
        line({ payee_vendor_id: null, payee_contact_id: 'contact-estes' }) as never,
        VENDOR.id,
      ),
    ).toBe(true);
  });
});

describe('<PoRiders>', () => {
  const renderRiders = (poId: string | null) =>
    render(
      <PoRiders
        purchaseOrderId={poId}
        projectId="project-1"
        vendor={VENDOR}
        receiptAnchor={{ kind: 'section', sectionKey: 'project' }}
      />,
    );

  it('adds a rider with "Bill the client" checked at cost by default', async () => {
    renderRiders('po-1');
    fireEvent.click(screen.getByRole('button', { name: /freight, crating, receiving/ }));
    expect(screen.getByRole('checkbox', { name: 'Bill the client' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Billing rule' })).toHaveValue('at_cost');
    fireEvent.change(screen.getByRole('textbox', { name: 'Estimate' }), {
      target: { value: '420' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add the freight' }));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(1));
    expect(mockUpsert).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      request: {
        kind: 'freight',
        payeeVendorId: VENDOR.id,
        payeeContactId: null,
        estimateCents: 42000,
        billableToClient: true,
        billingRule: 'at_cost',
      },
    });
  });

  it('overrides the billing rule per line', async () => {
    mockLines.data = [line()];
    renderRiders('po-1');
    fireEvent.change(screen.getByRole('combobox', { name: 'Billing rule' }), {
      target: { value: 'cost_plus' },
    });
    await waitFor(() =>
      expect(mockUpsert).toHaveBeenCalledWith({
        purchaseOrderId: 'po-1',
        request: { id: 'rider-1', billingRule: 'cost_plus' },
      }),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bill the client' }));
    await waitFor(() =>
      expect(mockUpsert).toHaveBeenCalledWith({
        purchaseOrderId: 'po-1',
        request: { id: 'rider-1', billableToClient: false },
      }),
    );
  });

  it('records the actual on blur, once it changed', async () => {
    mockLines.data = [line()];
    renderRiders('po-1');
    const actual = screen.getByRole('textbox', { name: 'Freight actual' });
    fireEvent.blur(actual);
    expect(mockUpsert).not.toHaveBeenCalled();
    fireEvent.change(actual, { target: { value: '465.00' } });
    fireEvent.blur(actual);
    await waitFor(() =>
      expect(mockUpsert).toHaveBeenCalledWith({
        purchaseOrderId: 'po-1',
        request: { id: 'rider-1', actualCents: 46500 },
      }),
    );
  });

  it('a billed rider is fixed', () => {
    mockLines.data = [line({ invoice_line_id: 'inv-line' })];
    renderRiders('po-1');
    expect(screen.getByRole('textbox', { name: 'Freight estimate' })).toBeDisabled();
    expect(screen.queryByRole('checkbox', { name: 'Bill the client' })).toBeNull();
    expect(screen.getByText('billed to the client')).toBeInTheDocument();
  });

  it('a rider owed to the carrier is paid against that payee, unscheduled', async () => {
    mockLines.data = [
      line({ payee_vendor_id: null, payee_contact_id: 'contact-estes', actual_cents: 46500 }),
    ];
    renderRiders('po-1');
    expect(screen.queryByRole('button', { name: /Record payment to Hale/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Record payment to Estes Express' }));
    expect(screen.getByRole('textbox', { name: 'Reference' })).toHaveValue('Freight · Estes Express');
    fireEvent.click(screen.getByRole('button', { name: /Record the freight · \$465/ }));
    await waitFor(() => expect(mockRecordPayment).toHaveBeenCalledTimes(1));
    const input = mockRecordPayment.mock.calls[0][0];
    expect(input).toMatchObject({
      purchaseOrderId: 'po-1',
      amountCents: 46500,
      reference: 'Freight · Estes Express',
    });
    expect(input).not.toHaveProperty('poPaymentId');
  });

  it('a rider on a vendor-paid line offers no payment of its own', () => {
    mockLines.data = [line()];
    renderRiders('po-1');
    expect(screen.queryByRole('button', { name: /Record payment/ })).toBeNull();
  });

  it('on a new paper, riders wait and are written once the PO exists', async () => {
    const { rerender } = renderRiders(null);
    fireEvent.click(screen.getByRole('button', { name: /freight, crating, receiving/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Estimate' }), {
      target: { value: '120' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add the freight' }));
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(screen.getByText(/estimate \$120/)).toBeInTheDocument();
    rerender(
      <PoRiders
        purchaseOrderId="po-new"
        projectId="project-1"
        vendor={VENDOR}
        receiptAnchor={{ kind: 'section', sectionKey: 'project' }}
      />,
    );
    await waitFor(() =>
      expect(mockUpsert).toHaveBeenCalledWith({
        purchaseOrderId: 'po-new',
        request: expect.objectContaining({ kind: 'freight', estimateCents: 12000 }),
      }),
    );
  });
});
