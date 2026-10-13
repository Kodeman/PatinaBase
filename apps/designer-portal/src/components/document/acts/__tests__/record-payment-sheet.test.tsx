/**
 * US-28 S4 (U-Q6) — the `record-payment` act kind: a sheet scoped to one
 * record, in the one act sheet (no second dialog), whose one filled act
 * carries the amount. A maker's scheduled payment writes through
 * useRecordVendorPayment; an overdue client invoice through useRecordPayment.
 * The real provider, DocSheet and DocumentAction render; the writers are
 * mocks whose calls are read.
 *
 * SQ-835 R1/R9/R10 — every figure prints to the cent in the record's own
 * currency, and the cents the label names are the cents the writer gets; a
 * failed read says so and reads again, apart from one still on its way and
 * from a record that is gone.
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

/** A read as React Query reports it. */
interface MockRead {
  data: unknown;
  isSuccess: boolean;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: jest.Mock;
}
const readOf = (data: unknown): MockRead => ({
  data,
  isSuccess: true,
  isPending: false,
  isError: false,
  isFetching: false,
  refetch: jest.fn().mockResolvedValue(undefined),
});
const pendingRead = (): MockRead => ({ ...readOf(undefined), isSuccess: false, isPending: true, isFetching: true });
const failedRead = (data: unknown = undefined): MockRead => ({ ...readOf(data), isSuccess: false, isError: true });

const mockRecordVendor = jest.fn();
const mockRecordInvoice = jest.fn();
let mockOrdersRead: MockRead;
let mockScheduleRead: MockRead;
let mockRecordsRead: MockRead;
let mockInvoiceRead: MockRead;

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  usePurchaseOrders: () => mockOrdersRead,
  usePOPayments: () => mockScheduleRead,
  useVendorPayments: () => mockRecordsRead,
  useRecordVendorPayment: () => ({ mutateAsync: mockRecordVendor }),
  useInvoice: () => mockInvoiceRead,
  useRecordPayment: () => ({ mutateAsync: mockRecordInvoice }),
}));

import { NeedActSheetProvider, useNeedActSheet } from '../need-act-sheet';
import { actSheetKindOf, recordsPayment, type ActSheetKind } from '../act-sheet-kind';

const ORDERS = [{ id: 'po-1', po_number: 'PO-CR-0412', vendor: { name: 'Calloway & Brandt Upholstery' } }];
const schedule = (amountCents: number) => [
  { id: 'pay-1', purchase_order_id: 'po-1', kind: 'balance', amount_cents: amountCents, due_date: '2026-10-16', state: 'due', label: null },
];
const invoice = (extra: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  invoice_number: 'INV-2026-0721',
  project_id: 'proj-1',
  status: 'sent',
  due_date: '2026-09-28',
  total_cents: 380000,
  amount_paid_cents: 0,
  currency: 'USD',
  client: { id: 'c-1', full_name: 'Nora Holloway' },
  ...extra,
});

/** The cents a filled act's label names: "Record €3,400.50" → 340050. */
const labelCents = (label: string) => Math.round(Number(label.replace(/[^\d.]/g, '')) * 100);

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

const READ_FAILED = 'This record could not be read, so the payment cannot be recorded yet.';

beforeEach(() => {
  opened = null;
  mockOrdersRead = readOf(ORDERS);
  mockScheduleRead = readOf(schedule(340000));
  mockRecordsRead = readOf([]);
  mockInvoiceRead = readOf(invoice());
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
    expect(dialogs[0]).toHaveTextContent('Balance to Calloway & Brandt Upholstery, $3,400.00, due');
    expect(dialogs[0]).toHaveTextContent('It sends nothing to Calloway & Brandt Upholstery.');
    const record = screen.getByRole('button', { name: 'Record $3,400.00' });
    // SQ-858 (money-p3) — the commit is the filled terminal act, and the only
    // filled act in the sheet: no other terminal, primary or inked act.
    expect(record).toHaveAttribute('data-action-variant', 'terminal');
    expect(record).toHaveClass('da-terminal');
    expect(document.querySelectorAll('[data-action-variant="terminal"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-action-variant="primary"], [data-action-variant="inked"]')).toHaveLength(0);
  });

  it('stands Put back in the foot beside the filled act, never in the head (money-p3)', async () => {
    openSheet(PAYMENT_NEED);
    const dialog = screen.getByRole('dialog');
    const head = dialog.querySelector('[data-doc-sheet-title-line]')!.parentElement!.parentElement!;
    expect(head).toHaveTextContent('Record a payment');
    expect(head).not.toHaveTextContent(/put back/i);
    expect(screen.queryByRole('button', { name: 'Put back · Esc' })).not.toBeInTheDocument();
    const foot = screen.getByRole('button', { name: 'Record $3,400.00' }).closest('[role="group"]') as HTMLElement;
    expect(foot).toHaveClass('rec-foot');
    const putBack = screen.getByRole('button', { name: 'Put back' });
    expect(foot).toContainElement(putBack);
    await userEvent.setup().click(putBack);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockRecordVendor).not.toHaveBeenCalled();
  });

  it('reads the day in words and runs the amount field the sheet’s width (money-p3)', async () => {
    openSheet(PAYMENT_NEED);
    const amount = screen.getByLabelText('Amount');
    expect(amount.closest('[data-act-record-payment]')).not.toBeNull();
    const [y, m, d] = todayYmd().split('-').map(Number);
    const today = new Date(y!, m! - 1, d!, 12);
    const words = `${today.toLocaleDateString('en-GB', { weekday: 'long' })} ${today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    const day = screen.getByRole('button', { name: `Paid on ${words}` });
    expect(day).toHaveTextContent(words);
    expect(day).not.toHaveTextContent(/\d{2}\/\d{2}\/\d{4}/);
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Choose a date from the calendar');
    await userEvent.setup().click(day);
    expect(day).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps Put back in the foot while the record is still on its way', () => {
    mockScheduleRead = pendingRead();
    openSheet(PAYMENT_NEED);
    expect(screen.getByRole('dialog')).toHaveTextContent('Loading the record…');
    expect(screen.getByRole('button', { name: 'Put back' }).closest('[role="group"]')).toHaveClass('rec-foot');
  });

  it('writes the remainder through the maker-payment writer, then puts the sheet back', async () => {
    mockRecordsRead = readOf([
      { po_payment_id: 'pay-1', amount_cents: 40000, voided_at: null },
      { po_payment_id: 'pay-1', amount_cents: 99900, voided_at: '2026-10-02T00:00:00Z' },
    ]);
    openSheet(PAYMENT_NEED);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Record $3,000.00' }));
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
    expect(screen.getByText('No more than $3,400.00 is open.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record $5,000.00' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.change(amount, { target: { value: '1,200' } });
    expect(screen.getByRole('dialog')).toHaveTextContent('counts toward the balance');
    await user.selectOptions(screen.getByLabelText('Method'), 'wire');
    await user.click(screen.getByRole('button', { name: 'Record $1,200.00' }));
    expect(mockRecordVendor).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 120000, method: 'wire' }));
  });

  it('stays open and says so when the record did not save', async () => {
    mockRecordVendor.mockRejectedValue(new Error('not permitted'));
    openSheet(PAYMENT_NEED);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Record $3,400.00' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The payment did not record. not permitted Try again.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('R1 — the label names the cents the writer gets', () => {
  it('prints a fractional-dollar balance to the cent and sends exactly those cents', async () => {
    mockScheduleRead = readOf(schedule(340050));
    openSheet(PAYMENT_NEED);
    expect(screen.getByRole('dialog')).toHaveTextContent('Balance to Calloway & Brandt Upholstery, $3,400.50, due');
    const label = 'Record $3,400.50';
    await userEvent.setup().click(screen.getByRole('button', { name: label }));
    expect(mockRecordVendor).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 340050 }));
    expect(mockRecordVendor.mock.calls[0][0].amountCents).toBe(labelCents(label));
  });

  it('prints a fractional part payment to the cent, and the open balance it may not pass', async () => {
    mockScheduleRead = readOf(schedule(340050));
    openSheet(PAYMENT_NEED);
    const amount = screen.getByLabelText('Amount');
    fireEvent.change(amount, { target: { value: '3400.51' } });
    expect(screen.getByText('No more than $3,400.50 is open.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record $3,400.51' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.change(amount, { target: { value: '1,200.75' } });
    const label = 'Record $1,200.75';
    await userEvent.setup().click(screen.getByRole('button', { name: label }));
    expect(mockRecordVendor).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 120075 }));
    expect(mockRecordVendor.mock.calls[0][0].amountCents).toBe(labelCents(label));
  });

  it('sends an invoice’s fractional part payment as the cents its label names', async () => {
    mockInvoiceRead = readOf(invoice({ total_cents: 380025, amount_paid_cents: 0 }));
    openSheet(INVOICE_NEED, 'record-payment');
    expect(screen.getByRole('dialog')).toHaveTextContent('Invoice INV-2026-0721 · $3,800.25 open');
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1000.10' } });
    expect(screen.getByRole('dialog')).toHaveTextContent('counts toward the invoice');
    const label = 'Record $1,000.10';
    await userEvent.setup().click(screen.getByRole('button', { name: label }));
    expect(mockRecordInvoice).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 100010 }));
    expect(mockRecordInvoice.mock.calls[0][0].amountCents).toBe(labelCents(label));
  });
});

describe('Record a client invoice’s payment', () => {
  it('opens the same one sheet from the invoice’s door, and writes through the invoice writer', async () => {
    openSheet(INVOICE_NEED, 'record-payment');
    expect(opened).toBe(true);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog')).toHaveTextContent('Invoice INV-2026-0721 · $3,800.00 open');
    expect(screen.getByRole('dialog')).toHaveTextContent('marks the invoice paid. It sends nothing to Nora Holloway.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Record $3,800.00' }));
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

describe('R10 — an invoice’s figures print in its own currency', () => {
  it('prints a EUR invoice in euros: the record, the act and the open balance', async () => {
    mockInvoiceRead = readOf(invoice({ currency: 'EUR' }));
    openSheet(INVOICE_NEED, 'record-payment');
    expect(screen.getByRole('dialog')).toHaveTextContent('Invoice INV-2026-0721 · €3,800.00 open');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('$3,800');
    const amount = screen.getByLabelText('Amount');
    fireEvent.change(amount, { target: { value: '4000' } });
    expect(screen.getByText('No more than €3,800.00 is open.')).toBeInTheDocument();
    fireEvent.change(amount, { target: { value: '3800' } });
    const label = 'Record €3,800.00';
    await userEvent.setup().click(screen.getByRole('button', { name: label }));
    expect(mockRecordInvoice).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 380000 }));
    expect(mockRecordInvoice.mock.calls[0][0].amountCents).toBe(labelCents(label));
  });

  it('prints a GBP invoice in pounds, to the cent', async () => {
    mockInvoiceRead = readOf(invoice({ currency: 'GBP', total_cents: 340050, amount_paid_cents: 0 }));
    openSheet(INVOICE_NEED, 'record-payment');
    expect(screen.getByRole('dialog')).toHaveTextContent('Invoice INV-2026-0721 · £3,400.50 open');
    const label = 'Record £3,400.50';
    await userEvent.setup().click(screen.getByRole('button', { name: label }));
    expect(mockRecordInvoice).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 340050 }));
    expect(mockRecordInvoice.mock.calls[0][0].amountCents).toBe(labelCents(label));
  });

  it('prints a JPY invoice to two decimals, so the act names exactly the cents it sends (R1b)', async () => {
    mockInvoiceRead = readOf(invoice({ currency: 'JPY', total_cents: 340050, amount_paid_cents: 0 }));
    openSheet(INVOICE_NEED, 'record-payment');
    expect(screen.getByRole('dialog')).toHaveTextContent('Invoice INV-2026-0721 · ¥3,400.50 open');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('¥3,401');
    const amount = screen.getByLabelText('Amount');
    fireEvent.change(amount, { target: { value: '3400.51' } });
    expect(screen.getByText('No more than ¥3,400.50 is open.')).toBeInTheDocument();
    fireEvent.change(amount, { target: { value: '3400.50' } });
    const label = 'Record ¥3,400.50';
    await userEvent.setup().click(screen.getByRole('button', { name: label }));
    const sent: number = mockRecordInvoice.mock.calls[0][0].amountCents;
    expect(sent).toBe(340050);
    // The payload at /100, two decimals, grouped: the label, character for character.
    const twoDecimals = (sent / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    expect(label).toBe(`Record ¥${twoDecimals}`);
  });
});

describe('R9 — a read on its way, a read that failed, a record that is gone', () => {
  it('reads "Loading" only while the maker’s payment is still on its way', () => {
    mockScheduleRead = pendingRead();
    openSheet(PAYMENT_NEED);
    expect(screen.getByRole('dialog')).toHaveTextContent('Loading the record…');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Record/ })).not.toBeInTheDocument();
  });

  it('says a failed maker read failed, and reads again on Try again', async () => {
    mockScheduleRead = failedRead();
    openSheet(PAYMENT_NEED);
    expect(screen.getByRole('alert')).toHaveTextContent(READ_FAILED);
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Loading the record…');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockScheduleRead.refetch).toHaveBeenCalledTimes(1);
    // Only the read that failed is read again.
    expect(mockOrdersRead.refetch).not.toHaveBeenCalled();
    expect(mockRecordsRead.refetch).not.toHaveBeenCalled();
    expect(mockRecordVendor).not.toHaveBeenCalled();
  });

  it('says so when the purchase order itself could not be read', async () => {
    mockOrdersRead = failedRead();
    openSheet(PAYMENT_NEED);
    expect(screen.getByRole('alert')).toHaveTextContent(READ_FAILED);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockOrdersRead.refetch).toHaveBeenCalledTimes(1);
  });

  it('says a failed invoice read failed, and reads again on Try again', async () => {
    mockInvoiceRead = failedRead();
    openSheet(INVOICE_NEED, 'record-payment');
    expect(screen.getByRole('alert')).toHaveTextContent(READ_FAILED);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockInvoiceRead.refetch).toHaveBeenCalledTimes(1);
    expect(mockRecordInvoice).not.toHaveBeenCalled();
  });

  it('keeps the form up when a refresh fails over a record already read', () => {
    mockInvoiceRead = failedRead(invoice());
    openSheet(INVOICE_NEED, 'record-payment');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record $3,800.00' })).toBeInTheDocument();
  });

  it('says the invoice is no longer open when it is gone', () => {
    mockInvoiceRead = readOf(null);
    openSheet(INVOICE_NEED, 'record-payment');
    expect(screen.getByRole('dialog')).toHaveTextContent('This record is no longer open.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says the maker’s payment is no longer open when its order is gone', () => {
    mockOrdersRead = readOf([]);
    mockScheduleRead = readOf([]);
    openSheet(PAYMENT_NEED);
    expect(screen.getByRole('dialog')).toHaveTextContent('This record is no longer open.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
