/**
 * US-19 FR3 F3-3 (`one-voice`) — the Money head's `Record the payment` opens
 * the Invoice folio with `landOn: 'record'`: the payment panel, its amount at
 * the balance, and focus on the one filled `Record the payment · $X`, its
 * consequence sentence directly above it. Esc closes the folio and focus goes
 * back to the act that opened it.
 *
 * The real InvoiceOverlays host and PaperFolioSheet render here.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Invoice } from '@patina/supabase';
import { fmtDay, todayYmd } from '@/lib/document/format';

let mockInvoice: Invoice;

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

// Held still, as invoice-folio.test.tsx holds it: the reconcile effect keys
// on the per-render mutation objects these mocks hand back.
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({ value: name === 'one-voice', isLoading: false }),
}));

jest.mock('@patina/supabase', () => {
  const idle = { mutateAsync: jest.fn(), isPending: false };
  return {
    useEmailDelivery: () => ({ byRef: {}, isLoading: false, isError: false }),
    useInvoice: () => ({ data: mockInvoice, isLoading: false, isError: false, refetch: jest.fn() }),
    useIssueInvoice: () => idle,
    useSendInvoice: () => idle,
    useRecordPayment: () => idle,
    useVoidInvoice: () => idle,
    useInvoiceLink: () => ({ data: null }),
    invoiceLinkIsLive: () => false,
    useRegenerateInvoiceLink: () => idle,
    RegenerateInvoiceLinkError: class RegenerateInvoiceLinkError extends Error {},
  };
});

jest.mock(
  '@/hooks/use-invoice-checkout-reconciliation',
  () => ({ useReconcileInvoiceCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }) }),
  { virtual: true },
);

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

import { InvoiceOverlays, openInvoiceFolio } from '../accounts/invoice-overlays';

const SENT: Invoice = {
  id: 'invoice-late',
  project_id: 'project-1',
  designer_id: 'designer-1',
  client_id: 'client-1',
  invoice_number: 'INV-1042',
  title: null,
  status: 'sent',
  issue_date: '2026-09-01',
  due_date: '2026-09-15',
  payment_terms_days: 14,
  currency: 'USD',
  subtotal_cents: 480_000,
  tax_rate: 0,
  tax_cents: 0,
  total_cents: 480_000,
  amount_paid_cents: 0,
  memo: null,
  internal_notes: null,
  stripe_checkout_session_id: null,
  sent_at: '2026-09-01T12:00:00.000Z',
  paid_at: null,
  voided_at: null,
  void_reason: null,
  reminder_count: 0,
  last_reminder_at: null,
  ar_flagged_at: null,
  ar_last_chased_at: null,
  created_at: '2026-09-01T12:00:00.000Z',
  updated_at: '2026-09-01T12:00:00.000Z',
  project: { id: 'project-1', name: 'Lake House' },
  client: { id: 'client-1', full_name: 'Margaret Chen', email: 'margaret@example.com' },
  line_items: [],
  payments: [],
};

/** The Money head's act, the control the folio was opened from. */
function renderWithOpener() {
  const view = render(
    <>
      <button type="button">Record the payment</button>
      <InvoiceOverlays />
    </>,
  );
  const opener = screen.getByRole('button', { name: 'Record the payment' });
  opener.focus();
  return { ...view, opener };
}

beforeEach(() => {
  mockInvoice = SENT;
});

describe('InvoiceFolio · landOn record (F3-3)', () => {
  it('opens on the payment panel with focus on its one filled act, the sentence above it', async () => {
    renderWithOpener();
    act(() => openInvoiceFolio('invoice-late', { landOn: 'record' }));

    const dialog = await screen.findByRole('dialog', { name: 'Invoice folio' });
    const recordAct = await screen.findByRole('button', { name: /^Record the payment · \$4,800/ });
    await waitFor(() => expect(recordAct).toHaveFocus());

    // V9 — exactly one filled act on the folio, and it is this one.
    const filled = dialog.querySelectorAll('.da-terminal');
    expect(filled).toHaveLength(1);
    expect(filled[0]).toBe(recordAct);

    const sentence = screen.getByText(
      `Records ${recordAct.textContent?.split(' · ')[1]} received from Margaret on ${fmtDay(todayYmd())} — voidable with a reason, never edited.`,
    );
    expect(sentence.compareDocumentPosition(recordAct) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Esc closes the folio and focus goes back to the act that opened it', async () => {
    const { opener } = renderWithOpener();
    act(() => openInvoiceFolio('invoice-late', { landOn: 'record' }));
    const recordAct = await screen.findByRole('button', { name: /^Record the payment · / });
    await waitFor(() => expect(recordAct).toHaveFocus());

    fireEvent.keyDown(recordAct, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('opens at rest without landOn: no payment panel, nothing filled', async () => {
    renderWithOpener();
    act(() => openInvoiceFolio('invoice-late'));
    const dialog = await screen.findByRole('dialog', { name: 'Invoice folio' });
    expect(screen.queryByRole('button', { name: /^Record the payment · / })).not.toBeInTheDocument();
    expect(dialog.querySelectorAll('.da-terminal')).toHaveLength(0);
  });

  it('an invoice that cannot take a payment opens without the landing', async () => {
    mockInvoice = { ...SENT, status: 'paid', amount_paid_cents: 480_000 };
    renderWithOpener();
    act(() => openInvoiceFolio('invoice-late', { landOn: 'record' }));
    await screen.findByRole('dialog', { name: 'Invoice folio' });
    expect(screen.queryByRole('button', { name: /^Record the payment · / })).not.toBeInTheDocument();
  });
});
