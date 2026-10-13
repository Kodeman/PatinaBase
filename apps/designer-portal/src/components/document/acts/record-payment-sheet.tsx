'use client';

/**
 * US-28 S4 (U-Q6) — Record a payment, in a sheet scoped to one record. It
 * opens in the one act sheet (NeedActSheetProvider's DocSheet), never a
 * second dialog, and writes through the writer each record already has:
 *
 *   payment_due      one scheduled maker payment (po_payments) →
 *                    useRecordVendorPayment (record_vendor_payment, 00695)
 *   overdue_invoice  one client invoice → useRecordPayment
 *                    (record_invoice_payment), as the invoice folio does
 *
 * The sheet's one filled act carries the amount ("Record $3,400"). Recording
 * sends nothing to anyone; the need clears at its source once the record
 * covers it.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useInvoice,
  usePOPayments,
  useRecordPayment,
  useRecordVendorPayment,
  useVendorPayments,
  type InvoicePaymentMethod,
  type VendorPaymentMethodKind,
} from '@patina/supabase';
import { INVOICE_PAYMENT_METHOD_LABELS } from '@patina/shared';
import { invoiceBalanceCents } from '@/lib/document/account-summary';
import type { DeskNeed } from '@/lib/document/desk-need-list';
import { fmtDay, fmtUsd, todayYmd } from '@/lib/document/format';
import { DateTextInput } from '../date-text-input';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { METHOD_WORD, paidToward, parseUsdToCents } from '../line-unfold/record-payment';
import { Missing, Reading, useOrder } from './act-sheets';

interface SheetProps {
  need: DeskNeed;
  onDone: () => void;
}

const KIND_WORD: Record<string, string> = {
  deposit: 'Deposit',
  balance: 'Balance',
  milestone: 'Payment',
  full_upfront: 'Payment in full',
};

const VENDOR_METHODS: readonly VendorPaymentMethodKind[] = ['check', 'ach', 'wire', 'card', 'cash', 'other'];
const INVOICE_METHODS: readonly Exclude<InvoicePaymentMethod, 'stripe'>[] = [
  'check',
  'wire',
  'ach_manual',
  'cash',
  'other',
];

const capitalised = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);
const errText = (e: unknown) => (e instanceof Error && e.message ? ` ${e.message}` : '');

/** The one form both records share: amount, the day, how it was paid. */
function PaymentForm<M extends string>({
  regionKey,
  record,
  balanceCents,
  dayLabel,
  methods,
  consequence,
  onRecord,
  onDone,
}: {
  regionKey: string;
  /** The record in one sentence, as its paper names it. */
  record: string;
  /** The most this record can still take, in cents. */
  balanceCents: number;
  dayLabel: string;
  methods: readonly (readonly [M, string])[];
  consequence: (full: boolean) => string;
  onRecord: (input: { amountCents: number; day: string; method: M }) => Promise<unknown>;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(() => (balanceCents / 100).toFixed(2));
  const [day, setDay] = useState<string | null>(() => todayYmd());
  const [method, setMethod] = useState<M>(methods[0]![0]);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const amountCents = parseUsdToCents(amount);
  const over = amountCents != null && amountCents > balanceCents;
  const complete = amountCents != null && !over && !!day;
  const label = amountCents != null ? `Record ${fmtUsd(amountCents)}` : 'Record the payment';

  const submit = async () => {
    if (!complete || pending) return;
    setPending(true);
    setFailed(null);
    try {
      await onRecord({ amountCents: amountCents!, day: day!, method });
      // The Desk reads money under its own key: one act, every surface.
      void queryClient.invalidateQueries({ queryKey: ['document-state'] });
      onDone();
    } catch (e) {
      setFailed(`The payment did not record.${errText(e)} Try again.`);
      setPending(false);
    }
  };

  return (
    <div data-act-record-payment className="space-y-5">
      <p className="t-body [overflow-wrap:anywhere]">{record}</p>
      <div className="field">
        <label className="label" htmlFor={`${regionKey}-amount`}>
          Amount
        </label>
        <span className="field-money">
          <input
            id={`${regionKey}-amount`}
            className="field-control"
            inputMode="decimal"
            value={amount}
            aria-invalid={amountCents == null || over || undefined}
            aria-describedby={amountCents == null || over ? `${regionKey}-amount-reason` : undefined}
            onChange={(event) => setAmount(event.target.value)}
          />
        </span>
        {(amountCents == null || over) && (
          <span id={`${regionKey}-amount-reason`} className="reason t-body-sm">
            {over ? `No more than ${fmtUsd(balanceCents)} is open.` : 'Enter the amount received.'}
          </span>
        )}
      </div>
      <div className="field">
        <span className="label">{dayLabel}</span>
        <DateTextInput value={day} ariaLabel={dayLabel} onChange={setDay} className="field-control" />
      </div>
      <div className="field">
        <label className="label" htmlFor={`${regionKey}-method`}>
          Method
        </label>
        <span className="field-select block">
          <select
            id={`${regionKey}-method`}
            className="field-control"
            value={method}
            onChange={(event) => setMethod(event.target.value as M)}
          >
            {methods.map(([value, word]) => (
              <option key={value} value={value}>
                {word}
              </option>
            ))}
          </select>
        </span>
      </div>
      <p className="t-body-sm text-[var(--text-muted)]">{consequence(amountCents === balanceCents)}</p>
      {failed && (
        <p role="alert" data-act-record-failed className="t-body-sm">
          {failed}
        </p>
      )}
      <DocumentActionGroup surfaceKey="open-document" regionKey={regionKey} aria-label="Record the payment">
        <DocumentAction
          actionKey={`${regionKey}-record`}
          variant="primary"
          disabled={!complete}
          held={!complete}
          loading={pending}
          loadingLabel="Recording…"
          onClick={() => void submit()}
        >
          {label}
        </DocumentAction>
      </DocumentActionGroup>
    </div>
  );
}

/** A maker's scheduled payment: its line's own act (in place of the ledger). */
function MakerPayment({ need, onDone }: SheetProps) {
  const poPaymentId = need.need.recordId!;
  const purchaseOrderId = need.need.ledger?.context?.purchaseOrderId ?? '';
  const order = useOrder(need.projectId, purchaseOrderId);
  const schedule = usePOPayments(purchaseOrderId);
  const records = useVendorPayments(purchaseOrderId);
  const record = useRecordVendorPayment({ errorSurface: 'inline' });
  if (!order.loaded || !schedule.isSuccess || !records.isSuccess) return <Reading />;
  const row = schedule.data?.find((payment) => payment.id === poPaymentId);
  const remainder = row ? Math.max(row.amount_cents - paidToward(records.data, row.id), 0) : 0;
  if (!row || row.state === 'paid' || row.state === 'refunded' || remainder === 0) return <Missing />;

  const maker = order.maker ?? 'the maker';
  const word = row.label?.trim() || KIND_WORD[row.kind] || 'Payment';
  const due = row.due_date ? `, due ${fmtDay(row.due_date)}` : '';
  return (
    <PaymentForm<VendorPaymentMethodKind>
      regionKey="act-record-payment"
      record={`${word} to ${maker}, ${fmtUsd(remainder)}${due}${order.label ? ` · ${order.label}` : ''}.`}
      balanceCents={remainder}
      dayLabel="Paid on"
      methods={VENDOR_METHODS.map((kind) => [kind, capitalised(METHOD_WORD[kind])] as const)}
      consequence={(full) =>
        `Recording the payment ${full ? `marks the ${word.toLowerCase()} paid` : `counts toward the ${word.toLowerCase()}`}. It sends nothing to ${maker}.`
      }
      onRecord={({ amountCents, day, method }) =>
        record.mutateAsync({ purchaseOrderId, poPaymentId, amountCents, paidOn: day, method })
      }
      onDone={onDone}
    />
  );
}

/** A client invoice: the quiet door beside its reminder. */
function InvoicePayment({ need, onDone }: SheetProps) {
  const invoiceId = need.need.recordId!;
  const { data: invoice, isSuccess } = useInvoice(invoiceId);
  const record = useRecordPayment({ errorSurface: 'inline' });
  if (!isSuccess) return <Reading />;
  const open = invoice && (invoice.status === 'sent' || invoice.status === 'partially_paid');
  const balance = invoice ? invoiceBalanceCents(invoice) : 0;
  if (!invoice || !open || balance === 0) return <Missing />;

  const client =
    invoice.client?.full_name?.trim() || invoice.project?.client?.full_name?.trim() || 'the client';
  const label = invoice.invoice_number ? `Invoice ${invoice.invoice_number}` : 'The invoice';
  const due = invoice.due_date ? `, due ${fmtDay(invoice.due_date)}` : '';
  return (
    <PaymentForm<Exclude<InvoicePaymentMethod, 'stripe'>>
      regionKey="act-record-invoice-payment"
      record={`${label} · ${fmtUsd(balance)} open${due}.`}
      balanceCents={balance}
      dayLabel="Date received"
      methods={INVOICE_METHODS.map((method) => [method, INVOICE_PAYMENT_METHOD_LABELS[method]] as const)}
      consequence={(full) =>
        `Recording the payment ${full ? 'marks the invoice paid' : 'counts toward the invoice'}. It sends nothing to ${client}.`
      }
      onRecord={({ amountCents, day, method }) =>
        record.mutateAsync({
          invoiceId,
          projectId: invoice.project_id ?? undefined,
          amountCents,
          method,
          receivedAt: new Date(`${day}T12:00:00`).toISOString(),
        })
      }
      onDone={onDone}
    />
  );
}

export function RecordPaymentSheet(props: SheetProps) {
  return props.need.need.kind === 'overdue_invoice' ? <InvoicePayment {...props} /> : <MakerPayment {...props} />;
}
