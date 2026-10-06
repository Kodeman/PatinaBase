import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  useFfeInvoiceCoverage,
  usePOPayments,
  useRecordVendorPayment,
  useStudioPaymentMethods,
  useVendorPayments,
  useVoidVendorPayment,
} from '@patina/supabase';
import { todayYmd } from '@/lib/document/format';
import { MoneyOutCell, frontingFact } from '../money-out-cell';
import { PoMoneyOut, parseUsdToCents } from '../record-payment';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@patina/supabase', () => ({
  usePOPayments: jest.fn(),
  useVendorPayments: jest.fn(),
  useStudioPaymentMethods: jest.fn(),
  useFfeInvoiceCoverage: jest.fn(),
  useRecordVendorPayment: jest.fn(),
  useVoidVendorPayment: jest.fn(),
}));

const mockUpload = jest.fn();
jest.mock('@/hooks/use-folio', () => ({
  useUploadFolioFile: () => ({ mutateAsync: mockUpload, isPending: false }),
}));

// The Folio trigger has its own suite; a plain input carries value in and out.
jest.mock('../../date-text-input', () => ({
  DateTextInput: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string | null;
    onChange: (value: string | null) => void;
    ariaLabel?: string;
  }) => (
    <input
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    />
  ),
}));

const mockRecord = jest.fn();
const mockVoid = jest.fn();

const DEPOSIT = {
  id: 'pay-dep',
  purchase_order_id: 'po-1',
  kind: 'deposit',
  state: 'paid',
  amount_cents: 441_000,
  due_date: null,
  paid_date: '2026-10-03',
  label: null,
  stripe_checkout_session_id: null,
  stripe_payment_intent_id: null,
};
const BALANCE = {
  id: 'pay-bal',
  purchase_order_id: 'po-1',
  kind: 'balance',
  state: 'due',
  amount_cents: 441_000,
  due_date: '2026-10-30',
  paid_date: null,
  label: null,
  stripe_checkout_session_id: null,
  stripe_payment_intent_id: null,
};

const AMEX = {
  id: 'pm-amex',
  organization_id: 'org-1',
  label: 'Amex · Leah',
  kind: 'card',
  last4: '4471',
  holder_member_id: null,
  archived_at: null,
};

const record = (over: Record<string, unknown> = {}) => ({
  id: 'vp-1',
  organization_id: 'org-1',
  purchase_order_id: 'po-1',
  po_payment_id: 'pay-bal',
  paid_on: '2026-10-05',
  amount_cents: 200_000,
  currency_code: 'USD',
  method: 'card',
  payment_method_id: 'pm-amex',
  reference: null,
  receipt_document_path: null,
  recorded_by: 'user-1',
  voided_at: null,
  void_reason: null,
  voided_by: null,
  created_at: '2026-10-05T12:00:00Z',
  ...over,
});

function setup({
  schedule = [DEPOSIT, BALANCE],
  records = [] as unknown[],
  methods = [AMEX] as unknown[],
  coverage = undefined as unknown,
} = {}) {
  (usePOPayments as jest.Mock).mockReturnValue({ data: schedule });
  (useVendorPayments as jest.Mock).mockReturnValue({ data: records });
  (useStudioPaymentMethods as jest.Mock).mockReturnValue({ data: methods });
  (useFfeInvoiceCoverage as jest.Mock).mockReturnValue({ data: coverage });
}

const renderBand = (props: Partial<Parameters<typeof PoMoneyOut>[0]> = {}) =>
  render(
    <PoMoneyOut
      purchaseOrderId="po-1"
      projectId="project-1"
      receiptAnchor={{ kind: 'line', anchorId: 'line-1' }}
      {...props}
    />,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockRecord.mockReset().mockResolvedValue({ id: 'vp-new' });
  mockVoid.mockReset().mockResolvedValue({ id: 'vp-1' });
  mockUpload.mockReset();
  (useRecordVendorPayment as jest.Mock).mockReturnValue({
    mutateAsync: mockRecord,
    isPending: false,
  });
  (useVoidVendorPayment as jest.Mock).mockReturnValue({
    mutateAsync: mockVoid,
    isPending: false,
  });
});

describe('PoMoneyOut · the schedule and its states', () => {
  it('reads each schedule row with its state; only an open row offers Record', () => {
    setup();
    renderBand();
    const band = screen.getByTestId('po-money-out');
    expect(band).toHaveTextContent('Deposit $4,410 · paid');
    expect(band).toHaveTextContent('Balance $4,410 · due');
    const acts = within(band).getAllByRole('button', { name: /^Record payment/ });
    expect(acts).toHaveLength(1);
    expect(acts[0]).toHaveAccessibleName('Record payment · Balance');
  });

  it('reads a partial payment as "paid X of Y" and pre-fills the remainder', () => {
    setup({ records: [record()] });
    renderBand();
    expect(screen.getByTestId('po-money-out')).toHaveTextContent(
      'Balance $4,410 · paid $2,000 of $4,410 · due',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record payment · Balance' }));
    expect(screen.getByLabelText('Amount paid')).toHaveValue('2410.00');
  });
});

describe('PoMoneyOut · record what we paid', () => {
  it('records the full remainder with the studio card it was paid on', async () => {
    setup();
    renderBand();
    fireEvent.click(screen.getByRole('button', { name: 'Record payment · Balance' }));
    expect(screen.getByLabelText('Amount paid')).toHaveValue('4410.00');
    expect(screen.getByLabelText('Paid with')).toHaveValue('pm:pm-amex');
    fireEvent.change(screen.getByLabelText('Reference'), {
      target: { value: ' conf 88123 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record the balance · $4,410' }));

    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
    expect(mockRecord).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      poPaymentId: 'pay-bal',
      paidOn: todayYmd(),
      amountCents: 441_000,
      paymentMethodId: 'pm-amex',
      reference: 'conf 88123',
    });
    await waitFor(() =>
      expect(screen.queryByTestId('record-payment-form')).not.toBeInTheDocument(),
    );
  });

  it('records a partial payment by check on the day it was paid', async () => {
    setup();
    renderBand();
    fireEvent.click(screen.getByRole('button', { name: 'Record payment · Balance' }));
    fireEvent.change(screen.getByLabelText('Amount paid'), {
      target: { value: '$2,000' },
    });
    fireEvent.change(screen.getByLabelText('Paid with'), {
      target: { value: 'kind:check' },
    });
    fireEvent.change(screen.getByLabelText('Paid on'), {
      target: { value: '2026-10-02' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record the balance · $2,000' }));

    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
    expect(mockRecord).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      poPaymentId: 'pay-bal',
      paidOn: '2026-10-02',
      amountCents: 200_000,
      method: 'check',
    });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('files an attached receipt first and records its path', async () => {
    setup();
    mockUpload.mockResolvedValue({ storage_path: 'project-1/1-receipt.pdf' });
    renderBand();
    fireEvent.click(screen.getByRole('button', { name: 'Record payment · Balance' }));
    const file = new File(['%PDF'], 'receipt.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Receipt'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Record the balance · $4,410' }));

    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
    expect(mockUpload).toHaveBeenCalledWith({
      file,
      anchor: { kind: 'line', anchorId: 'line-1' },
    });
    expect(mockRecord.mock.calls[0][0]).toMatchObject({
      receiptDocumentPath: 'project-1/1-receipt.pdf',
    });
  });

  it('holds the act while the amount is not a dollar figure', () => {
    setup();
    renderBand();
    fireEvent.click(screen.getByRole('button', { name: 'Record payment · Balance' }));
    fireEvent.change(screen.getByLabelText('Amount paid'), { target: { value: 'two' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the amount paid');
    const act = screen.getByRole('button', { name: /^Record the balance/ });
    expect(act).toBeDisabled();
    fireEvent.click(act);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('says why when the record is refused, and keeps the form open', async () => {
    setup();
    mockRecord.mockRejectedValue(new Error('record_vendor_payment: paidOn is in the future'));
    renderBand();
    fireEvent.click(screen.getByRole('button', { name: 'Record payment · Balance' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record the balance · $4,410' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('paidOn is in the future');
    expect(screen.getByTestId('record-payment-form')).toBeInTheDocument();
  });
});

describe('PoMoneyOut · void, never edit', () => {
  it('requires a reason before a payment can be voided', async () => {
    setup({ records: [record()] });
    renderBand();
    const rec = screen.getByTestId('vendor-payment-record');
    expect(rec).toHaveTextContent('$2,000 · Amex · Leah ••4471');
    fireEvent.click(within(rec).getByRole('button', { name: 'Void the $2,000 payment' }));

    const act = screen.getByRole('button', { name: 'Void payment' });
    expect(act).toBeDisabled();
    fireEvent.click(act);
    fireEvent.change(screen.getByLabelText('Reason for voiding'), {
      target: { value: '   ' },
    });
    expect(act).toBeDisabled();
    expect(mockVoid).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Reason for voiding'), {
      target: { value: ' Recorded on the wrong order ' },
    });
    expect(act).toBeEnabled();
    fireEvent.click(act);
    await waitFor(() =>
      expect(mockVoid).toHaveBeenCalledWith({
        paymentId: 'vp-1',
        purchaseOrderId: 'po-1',
        reason: 'Recorded on the wrong order',
      }),
    );
  });

  it('keeps a voided payment as struck history with its reason and no act', () => {
    setup({
      records: [record({ voided_at: '2026-10-06T00:00:00Z', void_reason: 'duplicate' })],
    });
    renderBand();
    const rec = screen.getByTestId('vendor-payment-record');
    expect(rec).toHaveTextContent('voided · duplicate');
    expect(within(rec).queryByRole('button')).not.toBeInTheDocument();
    // A void does not count toward the row.
    expect(screen.getByTestId('po-money-out')).not.toHaveTextContent('paid $2,000 of');
  });
});

describe('PoMoneyOut · Stripe and catalog rows are read-only', () => {
  it('reads a Stripe-rail row read-only on a studio PO', () => {
    setup({
      schedule: [
        DEPOSIT,
        { ...BALANCE, stripe_checkout_session_id: 'cs_test_1' },
      ],
    });
    renderBand();
    const band = screen.getByTestId('po-money-out');
    expect(band).toHaveTextContent('Settles through Patina checkout');
    expect(within(band).queryByRole('button', { name: /Record payment/ })).not.toBeInTheDocument();
  });

  it('reads a Patina-catalog PO without amounts or acts (V1)', () => {
    setup({ schedule: [{ ...BALANCE, kind: 'full_upfront', state: 'due' }] });
    renderBand({ isPatinaCatalog: true });
    const band = screen.getByTestId('po-money-out');
    expect(band).toHaveTextContent('Payment in full · due');
    expect(band).toHaveTextContent('Settles through Patina checkout');
    expect(band).not.toHaveTextContent('$');
    expect(within(band).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('MoneyOutCell · fronting fact (R9: a fact, never a block)', () => {
  it('states that the client deposit is not yet received beside the act', () => {
    setup({
      coverage: {
        'line-1': {
          coverage: 'invoiced',
          invoiceId: 'inv-1',
          invoiceNumber: 'INV-7',
          invoiceStatus: 'sent',
          billedCents: 648_000,
        },
      },
    });
    render(
      <MoneyOutCell
        po={{ id: 'po-1', is_patina_catalog: false, payments: [] }}
        projectId="project-1"
        itemId="line-1"
      />,
    );
    expect(screen.getByTestId('money-out-fronting')).toHaveTextContent(
      'Client deposit not yet received',
    );
    expect(screen.getByRole('button', { name: 'Record payment · Balance' })).toBeEnabled();
  });

  it('reads each coverage state, and stays silent without an entry', () => {
    const base = { invoiceId: null, invoiceNumber: null, billedCents: null };
    expect(frontingFact(undefined)).toBeNull();
    expect(frontingFact({ ...base, coverage: 'paid', invoiceStatus: 'paid' })).toBe(
      'Client has paid for this line',
    );
    expect(frontingFact({ ...base, coverage: 'uninvoiced', invoiceStatus: null })).toBe(
      'Client not yet invoiced for this line',
    );
    expect(frontingFact({ ...base, coverage: 'invoiced', invoiceStatus: 'draft' })).toBe(
      'Client invoice still in draft',
    );
    expect(
      frontingFact({ ...base, coverage: 'invoiced', invoiceStatus: 'partially_paid' }),
    ).toBe('Client has paid part of this line');
  });

  it('owes nothing before the line is ordered', () => {
    setup();
    render(<MoneyOutCell po={null} projectId="project-1" itemId="line-1" />);
    expect(screen.getByRole('group', { name: 'Money out' })).toHaveTextContent(
      'Nothing owed until it is ordered',
    );
    expect(usePOPayments).not.toHaveBeenCalled();
  });
});

describe('parseUsdToCents', () => {
  it('reads dollar entry to whole cents and refuses the rest', () => {
    expect(parseUsdToCents('$4,410.00')).toBe(441_000);
    expect(parseUsdToCents('2000')).toBe(200_000);
    expect(parseUsdToCents('12.5')).toBe(1250);
    expect(parseUsdToCents('0')).toBeNull();
    expect(parseUsdToCents('1.234')).toBeNull();
    expect(parseUsdToCents('two')).toBeNull();
  });
});
