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
 * The sheet's one filled act carries the amount ("Record $3,400.50"). Every
 * figure prints to the cent, in the record's own currency (`money`): the
 * label states exactly what the writer sends.
 * Recording sends nothing to anyone; the need clears at its source once the
 * record covers it.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useInvoice,
  usePOPayments,
  usePurchaseOrders,
  useRecordPayment,
  useRecordVendorPayment,
  useVendorPayments,
  type InvoicePaymentMethod,
  type VendorPaymentMethodKind,
} from '@patina/supabase';
import { INVOICE_PAYMENT_METHOD_LABELS } from '@patina/shared';
import { invoiceBalanceCents } from '@/lib/document/account-summary';
import type { DeskNeed } from '@/lib/document/desk-need-list';
import { fmtDay, todayYmd } from '@/lib/document/format';
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

/** R1b — cents → "¥3,400.50". Every currency is stored as amount × 100 and
 *  the amount field takes two decimals, so every figure prints two fraction
 *  digits, whatever the currency's own (ISO's JPY default would round
 *  340050 to "¥3,401"). The shared invoice formatter keeps its ISO digits. */
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

const capitalised = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);
const errText = (e: unknown) => (e instanceof Error && e.message ? ` ${e.message}` : '');

/** One of the sheet's reads, as React Query reports it. */
interface SheetRead {
  data: unknown;
  isError: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}

/** A read that failed with nothing to show, not one still on its way. */
const failedRead = (read: SheetRead) => read.isError && read.data === undefined;

/** A failed read says so and reads again on request. */
function ReadFailed({ regionKey, reads }: { regionKey: string; reads: readonly SheetRead[] }) {
  const failed = reads.filter(failedRead);
  return (
    <div data-act-read-failed className="space-y-4">
      <p role="alert" className="t-body-sm">
        This record could not be read, so the payment cannot be recorded yet.
      </p>
      <DocumentAction
        actionKey={`${regionKey}-retry`}
        surfaceKey="open-document"
        regionKey={regionKey}
        variant="secondary"
        loading={failed.some((read) => read.isFetching)}
        loadingLabel="Reading…"
        onClick={() => void Promise.all(failed.map((read) => read.refetch()))}
      >
        Try again
      </DocumentAction>
    </div>
  );
}

/** R9 — what stands in for the form until every read is here: the failure
 *  and its retry, or "Loading" while a read is still on its way. A read that
 *  has its data keeps the form up, so a failed background refresh never
 *  takes the amount she typed. Null once the record can be read. */
function unread(regionKey: string, reads: readonly SheetRead[]) {
  if (reads.some(failedRead)) return <ReadFailed regionKey={regionKey} reads={reads} />;
  if (reads.some((read) => read.data === undefined)) return <Reading />;
  return null;
}

/** The one form both records share: amount, the day, how it was paid. */
function PaymentForm<M extends string>({
  regionKey,
  record,
  balanceCents,
  currency,
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
  /** The record's ISO-4217 currency: every figure the form prints is in it. */
  currency: string;
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
  const label = amountCents != null ? `Record ${money(amountCents, currency)}` : 'Record the payment';

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
            {over ? `No more than ${money(balanceCents, currency)} is open.` : 'Enter the amount received.'}
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
  // useOrder reports only a successful read. The same purchase-orders query
  // (one cache entry) tells a failed read from one still on its way.
  const orders = usePurchaseOrders({ projectId: need.projectId });
  const schedule = usePOPayments(purchaseOrderId);
  const records = useVendorPayments(purchaseOrderId);
  const record = useRecordVendorPayment({ errorSurface: 'inline' });
  const waiting = unread('act-record-payment', [orders, schedule, records]);
  if (waiting) return waiting;
  // A PO that is gone takes its schedule with it (po_payments cascades), so
  // its payment reads as missing here.
  const row = schedule.data?.find((payment) => payment.id === poPaymentId);
  const remainder = row ? Math.max(row.amount_cents - paidToward(records.data, row.id), 0) : 0;
  if (!row || row.state === 'paid' || row.state === 'refunded' || remainder === 0) return <Missing />;

  // USD by constraint: neither purchase_orders nor po_payments carries a
  // currency column, and record_vendor_payment (00695) writes the ledger
  // row's currency_code as USD when, as here, none is passed.
  const currency = 'USD';
  const maker = order.maker ?? 'the maker';
  const word = row.label?.trim() || KIND_WORD[row.kind] || 'Payment';
  const due = row.due_date ? `, due ${fmtDay(row.due_date)}` : '';
  return (
    <PaymentForm<VendorPaymentMethodKind>
      regionKey="act-record-payment"
      record={`${word} to ${maker}, ${money(remainder, currency)}${due}${order.label ? ` · ${order.label}` : ''}.`}
      balanceCents={remainder}
      currency={currency}
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
  const read = useInvoice(invoiceId);
  const record = useRecordPayment({ errorSurface: 'inline' });
  const waiting = unread('act-record-invoice-payment', [read]);
  if (waiting) return waiting;
  // A gone invoice reads back as null.
  const invoice = read.data;
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
      record={`${label} · ${money(balance, invoice.currency)} open${due}.`}
      balanceCents={balance}
      currency={invoice.currency}
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
