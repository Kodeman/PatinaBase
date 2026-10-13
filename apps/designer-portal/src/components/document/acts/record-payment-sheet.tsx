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
 *
 * SQ-858 (money-p3): the sheet owns its head, so Put back sits in the foot
 * beside the filled terminal act rather than in the head; the amount field
 * runs the sheet's width; the day reads as a day ("Monday 12 October 2026").
 */

import { useRef, useState, type ReactNode } from 'react';
import { Banknote } from 'lucide-react';
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
import { WEEKDAY_FORMAT, legalDate } from '@/lib/document/dates';
import { fmtDay, todayYmd } from '@/lib/document/format';
import { FolioCalendar, FolioPopover } from '../date';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { DocSheetHead } from '../overlays/doc-sheet';
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

/** 'YYYY-MM-DD' → "Monday 12 October 2026", read at local noon so no
 *  timezone moves the day. */
function longDay(ymd: string) {
  const [year, month, day] = ymd.split('-').map(Number);
  const at = new Date(year!, month! - 1, day!, 12);
  return `${WEEKDAY_FORMAT.format(at)} ${legalDate(at)}`;
}

/** money-p3's day field: the day in words, the calendar on request. A record
 *  always carries a day, so there is nothing to clear. */
function DayField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="field">
      <span className="label" id={`${id}-label`}>
        {label}
      </span>
      <span className="relative block">
        <button
          ref={triggerRef}
          id={id}
          type="button"
          className="field-control text-left"
          aria-labelledby={`${id}-label ${id}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          {longDay(value)}
        </button>
        {open ? (
          <FolioPopover onClose={() => setOpen(false)} returnFocusRef={triggerRef} aria-label={label}>
            <FolioCalendar
              modes={['day']}
              value={{ kind: 'day', date: value }}
              today={todayYmd()}
              readoutLabels={{ day: label, span: label }}
              onCommit={(selection) => {
                if (selection.kind !== 'day') return;
                onChange(selection.date);
                setOpen(false);
              }}
            />
          </FolioPopover>
        ) : null}
      </span>
    </div>
  );
}

/** The sheet's foot: Put back, and beside it the act it may carry. Every state
 *  of the sheet stands on it, so the way back is always in the same place. */
function PaymentFoot({ regionKey, onDone, children }: { regionKey: string; onDone: () => void; children?: ReactNode }) {
  return (
    <DocumentActionGroup
      surfaceKey="open-document"
      regionKey={regionKey}
      aria-label="Record the payment"
      className="rec-foot"
    >
      <DocumentAction actionKey={`${regionKey}-put-back`} variant="tertiary" onClick={onDone}>
        Put back
      </DocumentAction>
      {children}
    </DocumentActionGroup>
  );
}

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
  const [day, setDay] = useState(() => todayYmd());
  const [method, setMethod] = useState<M>(methods[0]![0]);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const amountCents = parseUsdToCents(amount);
  const over = amountCents != null && amountCents > balanceCents;
  const complete = amountCents != null && !over;
  const label = amountCents != null ? `Record ${money(amountCents, currency)}` : 'Record the payment';

  const submit = async () => {
    if (!complete || pending) return;
    setPending(true);
    setFailed(null);
    try {
      await onRecord({ amountCents: amountCents!, day, method });
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
      <DayField id={`${regionKey}-day`} label={dayLabel} value={day} onChange={setDay} />
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
      {/* money-p3: the view's one filled act, the amount in its label, Put
          back beside it. Money moves here, so it takes the terminal fill. */}
      <PaymentFoot regionKey={regionKey} onDone={onDone}>
        <DocumentAction
          actionKey={`${regionKey}-record`}
          variant="terminal"
          disabled={!complete}
          held={!complete}
          loading={pending}
          loadingLabel="Recording…"
          onClick={() => void submit()}
        >
          {label}
        </DocumentAction>
      </PaymentFoot>
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
  if (waiting) return standing('act-record-payment', waiting, onDone);
  // A PO that is gone takes its schedule with it (po_payments cascades), so
  // its payment reads as missing here.
  const row = schedule.data?.find((payment) => payment.id === poPaymentId);
  const remainder = row ? Math.max(row.amount_cents - paidToward(records.data, row.id), 0) : 0;
  if (!row || row.state === 'paid' || row.state === 'refunded' || remainder === 0)
    return standing('act-record-payment', <Missing />, onDone);

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
  if (waiting) return standing('act-record-invoice-payment', waiting, onDone);
  // A gone invoice reads back as null.
  const invoice = read.data;
  const open = invoice && (invoice.status === 'sent' || invoice.status === 'partially_paid');
  const balance = invoice ? invoiceBalanceCents(invoice) : 0;
  if (!invoice || !open || balance === 0) return standing('act-record-invoice-payment', <Missing />, onDone);

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

/** A state with no form (loading, failed, gone) still stands on the foot. */
const standing = (regionKey: string, state: ReactNode, onDone: () => void) => (
  <div className="space-y-5">
    {state}
    <PaymentFoot regionKey={regionKey} onDone={onDone} />
  </div>
);

/** The sheet owns its head (NeedActSheetProvider passes `headOwnedByChild`), so
 *  the head carries the title alone and Put back stands in the foot. */
export function RecordPaymentSheet(props: SheetProps) {
  return (
    <>
      <DocSheetHead icon={Banknote} title="Record a payment" />
      {props.need.need.kind === 'overdue_invoice' ? <InvoicePayment {...props} /> : <MakerPayment {...props} />}
    </>
  );
}
