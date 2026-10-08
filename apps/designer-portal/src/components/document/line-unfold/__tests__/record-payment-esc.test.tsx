/**
 * US-19 FR3 F3-1 (`one-voice`) — Esc inside the record-payment form is Cancel:
 * the form closes, focus goes back to the control that opened it, and the
 * key is taken (`defaultPrevented`) so the paper's put-down does not fire.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  useFfeInvoiceCoverage,
  useFfeInvoiceStageCoverage,
  useProjectInvoices,
  usePOPayments,
  useRecordVendorPayment,
  useStartPoCheckout,
  useStudioPaymentMethods,
  useVendorPayments,
  useVoidVendorPayment,
} from '@patina/supabase';
import { landRecordPayment, recordPaymentPending } from '@/lib/document/registry';
import { PoMoneyOut, recordPaymentOpener } from '../record-payment';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@patina/supabase', () => ({
  usePOPayments: jest.fn(),
  useVendorPayments: jest.fn(),
  useStudioPaymentMethods: jest.fn(),
  useFfeInvoiceCoverage: jest.fn(),
  useFfeInvoiceStageCoverage: jest.fn(),
  useProjectInvoices: jest.fn(),
  useRecordVendorPayment: jest.fn(),
  useVoidVendorPayment: jest.fn(),
  useStartPoCheckout: jest.fn(),
  useUser: () => ({ user: { id: 'designer-1' } }),
  usePurchaseOrders: () => ({
    data: [{ id: 'po-1', designer_id: 'designer-1', vendor: { id: 'v-1', name: 'Woodward & Sons' } }],
  }),
}));

let mockOneVoice = false;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({ value: name === 'one-voice' && mockOneVoice, isLoading: false }),
}));

jest.mock('@/hooks/use-folio', () => ({
  useUploadFolioFile: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

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
    <input aria-label={ariaLabel} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />
  ),
}));

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

const mockRecord = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockOneVoice = false;
  recordPaymentOpener.element = null;
  (usePOPayments as jest.Mock).mockReturnValue({ data: [BALANCE] });
  (useVendorPayments as jest.Mock).mockReturnValue({ data: [] });
  (useStudioPaymentMethods as jest.Mock).mockReturnValue({ data: [] });
  (useFfeInvoiceCoverage as jest.Mock).mockReturnValue({ data: undefined });
  (useFfeInvoiceStageCoverage as jest.Mock).mockReturnValue({ data: undefined });
  (useProjectInvoices as jest.Mock).mockReturnValue({ data: undefined });
  (useRecordVendorPayment as jest.Mock).mockReturnValue({ mutateAsync: mockRecord, isPending: false });
  (useVoidVendorPayment as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (useStartPoCheckout as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
});

afterEach(() => {
  recordPaymentPending.request = null;
});

const renderBand = () =>
  render(
    <PoMoneyOut
      purchaseOrderId="po-1"
      projectId="project-1"
      receiptAnchor={{ kind: 'line', anchorId: 'line-1' }}
    />,
  );

describe('RecordPaymentForm · Esc is Cancel (US-19 F3-1)', () => {
  it('closes the form, takes the key, and hands focus back to the row act that opened it', async () => {
    mockOneVoice = true;
    renderBand();
    fireEvent.click(screen.getByRole('button', { name: 'Record the payment · Balance' }));
    const amount = screen.getByTestId('record-payment-form').querySelector('input')!;

    // fireEvent returns false when the handler called preventDefault — the
    // paper's put-down reads exactly that and stays put.
    const notTaken = fireEvent.keyDown(amount, { key: 'Escape' });
    expect(notTaken).toBe(false);
    expect(screen.queryByTestId('record-payment-form')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Record the payment · Balance' }),
      ),
    );
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('hands focus back to the band act a landing was pressed from', async () => {
    mockOneVoice = true;
    const band = document.createElement('button');
    band.textContent = 'Record the payment';
    document.body.appendChild(band);
    renderBand();

    recordPaymentOpener.element = band;
    act(() => landRecordPayment('po-1'));
    const recordAct = screen.getByRole('button', { name: 'Record the payment · $4,410' });
    await waitFor(() => expect(document.activeElement).toBe(recordAct));
    expect(recordPaymentOpener.element).toBeNull();

    fireEvent.keyDown(recordAct, { key: 'Escape' });
    expect(screen.queryByTestId('record-payment-form')).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(band));
    band.remove();
  });

  it('Cancel hands focus back the same way', async () => {
    mockOneVoice = true;
    renderBand();
    fireEvent.click(screen.getByRole('button', { name: 'Record the payment · Balance' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('record-payment-form')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Record the payment · Balance' }),
      ),
    );
  });

  it('leaves Esc alone with the flag off', () => {
    renderBand();
    fireEvent.click(screen.getByRole('button', { name: 'Record payment · Balance' }));
    const form = screen.getByTestId('record-payment-form');
    expect(fireEvent.keyDown(form.querySelector('input')!, { key: 'Escape' })).toBe(true);
    expect(screen.getByTestId('record-payment-form')).toBeInTheDocument();
  });
});
