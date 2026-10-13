/**
 * US-28 S4 (U-Q6) — the `record-payment` act kind: a sheet scoped to one
 * record, in the one act sheet (no second dialog), whose one filled act
 * carries the amount. A maker's scheduled payment writes through
 * useRecordVendorPayment; an overdue client invoice through useRecordPayment.
 * The real provider, DocSheet and DocumentAction render; the writers are
 * mocks whose calls are read.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DeskNeed } from '@/lib/document/desk-need-list';
import { todayYmd } from '@/lib/document/format';

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));
jest.mock('../../letterhead-instruments', () => ({ useSendDocumentNote: () => ({ mutateAsync: jest.fn() }) }));

const mockRecordVendor = jest.fn();
const mockRecordInvoice = jest.fn();
let mockRecords: { po_payment_id: string; amount_cents: number; voided_at: string | null }[] = [];

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  usePurchaseOrders: () => ({
    isSuccess: true,
    data: [{ id: 'po-1', po_number: 'PO-CR-0412', vendor: { name: 'Calloway & Brandt Upholstery' } }],
  }),
  usePOPayments: () => ({
    isSuccess: true,
    data: [
      { id: 'pay-1', purchase_order_id: 'po-1', kind: 'balance', amount_cents: 340000, due_date: '2026-10-16', state: 'due', label: null },
    ],
  }),
  useVendorPayments: () => ({ isSuccess: true, data: mockRecords }),
  useRecordVendorPayment: () => ({ mutateAsync: mockRecordVendor }),
  useInvoice: () => ({
    isSuccess: true,
    data: {
      id: 'inv-1',
      invoice_number: 'INV-2026-0721',
      project_id: 'proj-1',
      status: 'sent',
      due_date: '2026-09-28',
      total_cents: 380000,
      amount_paid_cents: 0,
      client: { id: 'c-1', full_name: 'Nora Holloway' },
    },
  }),
  useRecordPayment: () => ({ mutateAsync: mockRecordInvoice }),
}));

import { NeedActSheetProvider, useNeedActSheet } from '../need-act-sheet';
import { actSheetKindOf, recordsPayment, type ActSheetKind } from '../act-sheet-kind';

function deskNeed(kind: string, recordId: string | undefined, extra: Record<string, unknown> = {}): DeskNeed {
  const key = `${kind}:${recordId ?? 'none'}`;
  return {
    key,
    projectId: 'proj-1',
    projectName: 'Chen Residence',
    need: {
      key,
      ...(recordId ? { recordId } : {}),
      kind,
      text: 'The need',
      actionLabel: 'Record payment',
      stamp: { label: 'X', color: 'x' },
      urgent: false,
      owner: 'designer',
      ...extra,
    } as DeskNeed['need'],
  };
}

const PAYMENT_NEED = deskNeed('payment_due', 'pay-1', {
  ledger: { name: 'orders', context: { page: 'ledger', projectId: 'proj-1', purchaseOrderId: 'po-1' } },
});
const INVOICE_NEED = deskNeed('overdue_invoice', 'inv-1', { owner: 'client' });

let opened: boolean | null = null;
function Opener({ need, as }: { need: DeskNeed; as?: ActSheetKind }) {
  const sheet = useNeedActSheet();
  return (
    <button type="button" onClick={() => (opened = sheet.open(need, as))}>
      open the act
    </button>
  );
}

function openSheet(need: DeskNeed, as?: ActSheetKind) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NeedActSheetProvider>
        <Opener need={need} as={as} />
      </NeedActSheetProvider>
    </QueryClientProvider>,
  );
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'open the act' }));
  });
}

beforeEach(() => {
  opened = null;
  mockRecords = [];
  mockRecordVendor.mockReset().mockResolvedValue({ id: 'vp-1' });
  mockRecordInvoice.mockReset().mockResolvedValue({ id: 'ip-1' });
});

describe('the record-payment act kind (U-Q6)', () => {
  it('is a maker’s scheduled payment’s own sheet, in place of the Orders ledger', () => {
    expect(actSheetKindOf(PAYMENT_NEED)).toBe('record-payment');
    expect(recordsPayment(PAYMENT_NEED)).toBe(true);
    // A payment the paper cannot place on one PO keeps its ledger landing.
    expect(actSheetKindOf(deskNeed('payment_due', 'pay-1'))).toBeNull();
  });

  it('leaves an overdue invoice its reminder, with recording as a second door', () => {
    expect(actSheetKindOf(INVOICE_NEED)).toBe('invoice-reminder');
    expect(recordsPayment(INVOICE_NEED)).toBe(true);
    expect(recordsPayment(deskNeed('proposal_declined', 'prop-1'))).toBe(false);
    expect(recordsPayment(deskNeed('overdue_invoice', undefined))).toBe(false);
  });

  it('refuses a payment sheet for a need with no payment to record', () => {
    openSheet(deskNeed('proposal_declined', 'prop-1'), 'record-payment');
    expect(opened).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Record a payment to a maker', () => {
  it('opens one sheet scoped to the payment, whose one filled act carries the amount', () => {
    openSheet(PAYMENT_NEED);
    expect(opened).toBe(true);
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toHaveTextContent('Record a payment');
    expect(dialogs[0]).toHaveTextContent('Balance to Calloway & Brandt Upholstery, $3,400');
    expect(dialogs[0]).toHaveTextContent('It sends nothing to Calloway & Brandt Upholstery.');
    const record = screen.getByRole('button', { name: 'Record $3,400' });
    expect(record).toHaveAttribute('data-action-variant', 'primary');
    expect(document.querySelectorAll('[data-action-variant="primary"]')).toHaveLength(1);
  });

  it('writes the remainder through the maker-payment writer, then puts the sheet back', async () => {
    mockRecords = [
      { po_payment_id: 'pay-1', amount_cents: 40000, voided_at: null },
      { po_payment_id: 'pay-1', amount_cents: 99900, voided_at: '2026-10-02T00:00:00Z' },
    ];
    openSheet(PAYMENT_NEED);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Record $3,000' }));
    expect(mockRecordVendor).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      poPaymentId: 'pay-1',
      amountCents: 300000,
      paidOn: todayYmd(),
      method: 'check',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('records a part payment under its own amount, and never more than is open', async () => {
    openSheet(PAYMENT_NEED);
    const user = userEvent.setup();
    const amount = screen.getByLabelText('Amount');
    fireEvent.change(amount, { target: { value: '5000' } });
    expect(screen.getByText('No more than $3,400 is open.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record $5,000' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.change(amount, { target: { value: '1,200' } });
    expect(screen.getByRole('dialog')).toHaveTextContent('counts toward the balance');
    await user.selectOptions(screen.getByLabelText('Method'), 'wire');
    await user.click(screen.getByRole('button', { name: 'Record $1,200' }));
    expect(mockRecordVendor).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 120000, method: 'wire' }));
  });

  it('stays open and says so when the record did not save', async () => {
    mockRecordVendor.mockRejectedValue(new Error('not permitted'));
    openSheet(PAYMENT_NEED);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Record $3,400' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The payment did not record. not permitted Try again.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Record a client invoice’s payment', () => {
  it('opens the same one sheet from the invoice’s door, and writes through the invoice writer', async () => {
    openSheet(INVOICE_NEED, 'record-payment');
    expect(opened).toBe(true);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog')).toHaveTextContent('Invoice INV-2026-0721 · $3,800 open');
    expect(screen.getByRole('dialog')).toHaveTextContent('marks the invoice paid. It sends nothing to Nora Holloway.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Record $3,800' }));
    expect(mockRecordInvoice).toHaveBeenCalledWith({
      invoiceId: 'inv-1',
      projectId: 'proj-1',
      amountCents: 380000,
      method: 'check',
      receivedAt: new Date(`${todayYmd()}T12:00:00`).toISOString(),
    });
    expect(mockRecordVendor).not.toHaveBeenCalled();
  });
});
