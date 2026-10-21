'use client';

import { formatCurrency } from '@patina/shared';

import { dueLine } from '@/components/threshold/instruments/spine-toll';
import { ScoredAction } from '@/components/threshold/instruments/scored-action';
import { legalDate } from '@/lib/threshold/dates';
import type { InvoiceRow, InvoiceServerHold } from '@/lib/threshold/invoice-rollup';

import { useLetterPayee } from './letter-payee';
import { sentenceStart } from './payment-method-chooser';
import { holdSentence, Settlement } from './settlement';

/* ── EVERY INVOICE, ON ITS OWN LINE (US-45 CPUX-02 layout) ──────────────────
   Each outstanding invoice is a row in plain view: its name, number and
   origin, what is left to pay, and its written due or payment status. No
   outstanding invoice waits behind a fold. "View invoice" opens that row's
   details in place — the payment sheet for an invoice that can be paid here,
   the standing facts for one in progress or under review — and opening it
   changes nothing on the server. One row is open at a time; the letterbox
   owns which, and keeps every returned hold and check acknowledgement by
   invoice id, so closing or switching forgets none of them.

   Payment history is the only fold, and it is ordinary content once open. */

export interface InvoiceListState {
  openId: string | null;
  onToggle: (row: InvoiceRow) => void;
  onClose: (row: InvoiceRow) => void;
  /** Holds the checkout boundary returned this session, by invoice id. */
  holds: Readonly<Record<string, InvoiceServerHold>>;
  onHold: (invoiceId: string, hold: InvoiceServerHold) => void;
  /** Invoices whose studio already knows a check is coming. */
  checksExpected: Readonly<Record<string, true>>;
  onCheckExpected: (invoiceId: string) => void;
  /** The invoice a return from the till is still unconfirmed for. */
  checkoutHeldId: string | null;
  /** The designer, as a sentence names them mid-way ("your designer" when unknown). */
  designerName: string;
  /** The house this list stands in, for a project invoice's origin. */
  projectName: string | null;
  /** More than one currency in view: every amount names its currency code. */
  mixedCurrency: boolean;
  onRefetch?: () => void | Promise<unknown>;
}

export function invoiceDomIds(invoiceId: string) {
  return {
    toggle: `invoice-${invoiceId}-toggle`,
    region: `invoice-${invoiceId}-details`,
    heading: `invoice-${invoiceId}-details-h`,
  };
}

const NARROW: Record<string, Intl.NumberFormat> = {};

/** "$300.00", or "CAD $120.00" once two currencies share the page. Never converted. */
export function invoiceMoney(cents: number, currency: string, mixed: boolean): string {
  if (!mixed) return formatCurrency(cents, currency);
  NARROW[currency] ??= new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  });
  return `${currency} ${NARROW[currency].format(cents / 100)}`;
}

function pendingStart(row: InvoiceRow): string | null {
  const pending = row.invoice.payments?.find(
    (payment) => payment.status === 'pending' && payment.stripe_payment_intent_id != null,
  );
  return pending ? legalDate(pending.created_at) : null;
}

function rowMoney(row: InvoiceRow, cents: number, state: InvoiceListState): string {
  return invoiceMoney(cents, row.currency, state.mixedCurrency);
}

function refundSentence(designer: string): string {
  return `This payment needs a closer look. ${designer} will follow up. You don’t need to do anything now.`;
}

function reviewNote(row: InvoiceRow, who: string): string {
  const reason = row.reviewReasons[0];
  if (reason === 'requires_refund') return refundSentence(sentenceStart(who));
  if (reason === 'reconciliation_hold') {
    return 'This payment is on hold until it’s checked. You don’t need to pay again.';
  }
  return 'We can’t confirm this invoice’s payment status.';
}

function processingNote(row: InvoiceRow, hold: InvoiceServerHold | undefined): string {
  if (hold === 'payment_processing') return 'Your payment is still processing. You don’t need to pay again.';
  const started = pendingStart(row);
  return `${started ? `Payment started ${started}` : 'Payment started'}. Confirmation is pending. You don’t need to pay again.`;
}

/** The one line a row in progress or under review adds under its due status. */
function standingNote(row: InvoiceRow, state: InvoiceListState, who: string): string | null {
  if (row.group === 'review') return reviewNote(row, who);
  if (row.group === 'processing') return processingNote(row, state.holds[row.invoice.id]);
  if (!state.checksExpected[row.invoice.id]) return null;
  return `Check expected. The balance stays ${rowMoney(row, row.balanceCents, state)} until the check arrives and is recorded.`;
}

function reviewDetail(row: InvoiceRow, state: InvoiceListState, designer: string): string {
  const reason = row.reviewReasons[0];
  if (reason === 'requires_refund') return refundSentence(designer);
  if (reason === 'reconciliation_hold') return holdSentence('payment_reconciliation_required', designer);
  if (reason === 'paid_with_balance') {
    return `Its record says paid, but ${rowMoney(row, row.balanceCents, state)} still shows as due. Until the two agree, it isn’t shown as paid and can’t be paid here.`;
  }
  return `Until its payment status is confirmed, it can’t be paid here. ${designer} can help.`;
}

/** What the open details of a row in progress or under review say. */
function standingDetail(row: InvoiceRow, state: InvoiceListState, who: string): string {
  const designer = sentenceStart(who);
  if (row.group !== 'processing') return reviewDetail(row, state, designer);
  return state.holds[row.invoice.id] === 'payment_processing'
    ? holdSentence('payment_processing', designer)
    : 'Confirmation is pending. The balance updates only when the payment is confirmed.';
}

function trimmed(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/** What a row says on its own lines, outstanding or settled. */
interface RowLines {
  amountCents: number;
  ofTotal: string;
  status: string;
  note: string | null;
}

function historyLines(row: InvoiceRow): RowLines {
  return {
    amountCents: row.invoice.total_cents,
    ofTotal: '',
    status: historyStatus(row),
    note: null,
  };
}

function outstandingLines(row: InvoiceRow, state: InvoiceListState, payee: string): RowLines {
  const { invoice } = row;
  return {
    amountCents: row.balanceCents,
    ofTotal: invoice.amount_paid_cents > 0 ? `of ${rowMoney(row, invoice.total_cents, state)}` : '',
    status: dueLine(invoice.due_date, row.dueState, invoice.amount_paid_cents, row.currency),
    note: standingNote(row, state, payee),
  };
}

/** Its number (when a title names it) and where it comes from: the studio, or the house. */
function rowReference(row: InvoiceRow, payee: string, projectName: string | null): string {
  const { invoice } = row;
  const origin = row.studio ? payee : (trimmed(invoice.project?.name) ?? projectName);
  const number = trimmed(invoice.title) ? trimmed(invoice.invoice_number) : null;
  return [number, origin].filter(Boolean).join(' · ');
}

function rowName(row: InvoiceRow): string {
  return trimmed(row.invoice.title) ?? trimmed(row.invoice.invoice_number) ?? 'Invoice';
}

function historyStatus(row: InvoiceRow): string {
  const { invoice } = row;
  if (row.settled === 'paid') {
    const paid = legalDate(invoice.paid_at);
    return paid ? `Paid ${paid}` : 'Paid';
  }
  const sent = legalDate(invoice.sent_at);
  return sent ? `No balance due · sent ${sent}` : 'No balance due';
}

interface RowProps {
  row: InvoiceRow;
  state: InvoiceListState;
}

/** One invoice: always drawn in full, with its details opening in place. */
export function InvoiceRowItem({ row, state }: RowProps) {
  const { invoice } = row;
  const payee = useLetterPayee(invoice, state.designerName);
  const ids = invoiceDomIds(invoice.id);
  const open = state.openId === invoice.id;
  const lines = row.group === 'history' ? historyLines(row) : outstandingLines(row, state, payee);

  return (
    <li
      data-testid="invoice-row"
      data-invoice-id={invoice.id}
      data-group={row.group}
      className="border-t border-[var(--color-card-rule)] py-4 first:border-t-0"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5">
        <p
          data-testid="invoice-row-name"
          className="text-[16px] font-medium leading-[1.5] text-[var(--text-primary)]"
        >
          {rowName(row)}
        </p>
        <p
          data-testid="invoice-row-amount"
          className="text-right font-mono text-[16px] leading-[1.5] tabular-nums text-[var(--text-primary)]"
        >
          {rowMoney(row, lines.amountCents, state)}
        </p>
        <p data-testid="invoice-row-reference" className="text-[15px] leading-[1.5] text-[var(--text-body)]">
          {rowReference(row, payee, state.projectName)}
        </p>
        <p className="text-right font-mono text-[15px] leading-[1.5] tabular-nums text-[var(--text-body)]">
          {lines.ofTotal}
        </p>
        <p
          data-testid="invoice-row-status"
          className="col-span-2 text-[16px] leading-[1.55] text-[var(--text-primary)]"
        >
          {lines.status}
        </p>
        {lines.note && (
          <p
            data-testid="invoice-row-note"
            className="col-span-2 text-[16px] leading-[1.55] text-[var(--text-primary)]"
          >
            {lines.note}
          </p>
        )}
      </div>

      <div className="mt-1">
        <ScoredAction
          id={ids.toggle}
          actionKey="letterbox_open"
          regionKey="letterbox"
          surfaceKey="the_threshold"
          variant="secondary"
          aria-expanded={open}
          aria-controls={ids.region}
          onClick={() => state.onToggle(row)}
        >
          View invoice
        </ScoredAction>
      </div>

      <div
        id={ids.region}
        role="region"
        aria-labelledby={ids.heading}
        hidden={!open}
        data-testid="invoice-details"
      >
        {open && <InvoiceDetails row={row} state={state} payee={payee} />}
      </div>
    </li>
  );
}

const DETAILS_COPY = {
  history: { heading: 'Invoice details for', close: 'Close invoice details' },
  outstanding: {
    heading: 'Payment details for',
    close: 'Close payment details',
  },
} as const;

function InvoiceDetails({ row, state, payee }: RowProps & { payee: string }) {
  const { invoice } = row;
  const ids = invoiceDomIds(invoice.id);
  const label = trimmed(invoice.invoice_number) ?? trimmed(invoice.title) ?? 'this invoice';
  const copy = DETAILS_COPY[row.group === 'history' ? 'history' : 'outstanding'];

  return (
    <div className="mt-3 flex flex-col gap-4">
      <h4
        id={ids.heading}
        tabIndex={-1}
        className="text-[16px] font-medium leading-[1.5] text-[var(--text-primary)] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
      >
        {`${copy.heading} ${label}`}
      </h4>

      {row.group === 'payable' ? (
        <PayableDetails row={row} state={state} payee={payee} />
      ) : (
        <StandingCard row={row} state={state} payee={payee} />
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <ScoredAction
          actionKey="letterbox_close"
          regionKey="letterbox"
          surfaceKey="the_threshold"
          variant="secondary"
          onClick={() => state.onClose(row)}
        >
          {copy.close}
        </ScoredAction>
        {/* The printable sheet: the line items, tax, memo and payments. It is
            the invoice, not a receipt, and says so. */}
        <ScoredAction
          actionKey="invoice_print"
          regionKey="letterbox"
          surfaceKey="the_threshold"
          variant="tertiary"
          href={`/invoices/${invoice.id}/print`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Print invoice
        </ScoredAction>
      </div>
    </div>
  );
}

/** The payment sheet, for an invoice that can be paid here. */
function PayableDetails({ row, state, payee }: RowProps & { payee: string }) {
  const id = row.invoice.id;
  return (
    <Settlement
      row={row}
      designerName={payee}
      payeeName={payee}
      hold={state.checkoutHeldId === id}
      serverHold={state.holds[id] ?? null}
      onHold={(hold) => state.onHold(id, hold)}
      checkExpected={state.checksExpected[id] === true}
      onCheckExpected={() => state.onCheckExpected(id)}
      onRefetch={state.onRefetch}
    />
  );
}

const FIGURE_TERM = 'text-[15px] text-[var(--text-body)]';
const FIGURE_VALUE = 'm-0 font-mono tabular-nums text-[var(--text-primary)]';

/** The standing facts of an invoice in progress, under review, or settled. */
function StandingCard({ row, state, payee }: RowProps & { payee: string }) {
  const { invoice } = row;
  const inHistory = row.group === 'history';
  return (
    <div className="cp-card flex flex-col gap-3 px-4 py-4 sm:px-6">
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[16px] leading-[1.5]">
        <dt className={FIGURE_TERM}>Payable to</dt>
        <dd className="m-0 text-[var(--text-primary)]">{payee}</dd>
        {inHistory ? (
          <>
            <dt className={FIGURE_TERM}>Invoice total</dt>
            <dd className={FIGURE_VALUE}>{rowMoney(row, invoice.total_cents, state)}</dd>
            <dt className={FIGURE_TERM}>Paid</dt>
            <dd className={FIGURE_VALUE}>{rowMoney(row, invoice.amount_paid_cents, state)}</dd>
          </>
        ) : (
          <>
            <dt className={FIGURE_TERM}>Balance</dt>
            <dd className={FIGURE_VALUE}>{rowMoney(row, row.balanceCents, state)}</dd>
          </>
        )}
      </dl>
      {!inHistory && (
        <p role="status" data-testid="invoice-standing" className="cp-note text-[16px] leading-[1.55]">
          {standingDetail(row, state, payee)}
        </p>
      )}
    </div>
  );
}

/** One group of rows under its own heading, every row in plain view. */
export function InvoiceGroupList({
  heading,
  summary,
  rows,
  state,
  testId,
}: {
  heading: string;
  summary?: string | null;
  rows: readonly InvoiceRow[];
  state: InvoiceListState;
  testId: string;
}) {
  return (
    <section data-testid={testId} aria-label={heading} className="flex flex-col gap-1">
      <h3 className="text-[18px] font-medium leading-[1.4] text-[var(--text-primary)]">{heading}</h3>
      {summary && <p className="text-[15px] leading-[1.5] text-[var(--text-body)]">{summary}</p>}
      <ul aria-label={heading} className="m-0 list-none p-0">
        {rows.map((row) => (
          <InvoiceRowItem key={row.invoice.id} row={row} state={state} />
        ))}
      </ul>
    </section>
  );
}

/** Settled invoices, newest first, behind the one fold on the surface. */
export function PaymentHistory({
  rows,
  summary,
  open,
  onToggle,
  state,
}: {
  rows: readonly InvoiceRow[];
  summary: string | null;
  open: boolean;
  onToggle: () => void;
  state: InvoiceListState;
}) {
  if (rows.length === 0) return null;
  return (
    <section data-testid="payment-history" aria-label="Payment history" className="flex flex-col gap-1">
      <h3 className="m-0">
        <ScoredAction
          actionKey="earlier_invoices"
          regionKey="letterbox"
          surfaceKey="the_threshold"
          variant="secondary"
          aria-expanded={open}
          aria-controls="payment-history-list"
          onClick={onToggle}
        >
          Payment history
        </ScoredAction>
      </h3>
      {summary && <p className="text-[15px] leading-[1.5] text-[var(--text-body)]">{summary}</p>}
      <ul id="payment-history-list" aria-label="Payment history" hidden={!open} className="m-0 list-none p-0">
        {open && rows.map((row) => <InvoiceRowItem key={row.invoice.id} row={row} state={state} />)}
      </ul>
    </section>
  );
}
