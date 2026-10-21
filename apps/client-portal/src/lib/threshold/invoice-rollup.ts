import { invoiceBalanceCents } from '@patina/shared';
import type { Invoice } from '@patina/supabase';

import { calendarDayOrdinal, parseSourceDate } from './dates';

/* ── One invoice projection (CPUX-02) ────────────────────────────────────────
   Every client surface that shows money owed reads it from here: which
   invoices are visible, which house holds them, which ONE group each stands
   in, how they sort, what they total, and whether the reads behind them are
   complete enough to say any of it. Pure: no React, no network, no clock —
   `today` and the read state are handed in. ───────────────────────────────── */

/**
 * Invoices worth counting on the house ledger. `draft` invoices are
 * pre-issue (RLS already hides them from the client; filtered again here
 * defensively) and `void` invoices are cancelled — neither belongs in
 * "what have I paid" / "what do I owe".
 */
export function visibleInvoices(invoices: readonly Invoice[]): Invoice[] {
  return invoices.filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'void');
}

/** Visible rows, each id once; the first occurrence wins. */
function uniqueVisible(invoices: readonly Invoice[]): Invoice[] {
  const seen = new Set<string>();
  return visibleInvoices(invoices).filter((invoice) => {
    if (seen.has(invoice.id)) return false;
    seen.add(invoice.id);
    return true;
  });
}

// ── reads ────────────────────────────────────────────────────────────────────

/** What one invoice read has told the page — TanStack's own fields, so a query result passes as is. */
export interface InvoiceReadSource {
  data: readonly Invoice[] | undefined;
  isPending: boolean;
  isError: boolean;
}

/**
 * loading  — a required read has not returned; no count, total or all-clear.
 * failed   — every required read failed with nothing cached.
 * partial  — one required read failed with nothing cached; the others' rows stand.
 * stale    — every read has rows, but a refresh failed; the rows may be out of date.
 * complete — every required read returned on its latest attempt.
 */
export type InvoiceReadState = 'loading' | 'failed' | 'partial' | 'stale' | 'complete';

export function invoiceReadState(sources: readonly InvoiceReadSource[]): InvoiceReadState {
  if (sources.some((source) => source.isPending || (!source.isError && source.data === undefined))) {
    return 'loading';
  }
  const unread = sources.filter((source) => source.data === undefined).length;
  if (unread > 0) return unread === sources.length ? 'failed' : 'partial';
  return sources.some((source) => source.isError) ? 'stale' : 'complete';
}

/** A read not handed in has told the page nothing. */
const UNREAD: InvoiceReadSource = { data: undefined, isPending: true, isError: false };

export interface HouseInvoicesInput {
  /** This house, or null on the studio-only door. */
  projectId: string | null;
  /** `standsUnfiled(projectId, otherHouseIds)`. Ignored on the door, which always holds the studio invoices. */
  adopted?: boolean;
  /** `useProjectInvoices(projectId)`. Required when `projectId` is set. */
  project?: InvoiceReadSource;
  /** `useClientInvoices()`. Required on the door and in the adopted house. */
  client?: InvoiceReadSource;
}

export interface HouseInvoices {
  /** Visible, each id once: the house's own invoices, then the studio invoices it adopts. */
  invoices: Invoice[];
  /** Completeness of exactly the reads this house needs. */
  read: InvoiceReadState;
}

/**
 * The invoices one page holds. A project page holds its own invoices; studio
 * invoices (`project_id === null`) stand only in the adopted house — the lowest
 * project id the client can open (`adopted-house.ts`) — so the same letter is
 * never listed or settled twice. The studio-only door holds the studio
 * invoices. The client read's state counts only where its rows are used.
 */
export function houseInvoices({
  projectId,
  adopted = false,
  project,
  client,
}: HouseInvoicesInput): HouseInvoices {
  const reads = [...ownRead(projectId, project), ...studioRead(!projectId || adopted, client)];
  return {
    invoices: uniqueVisible(reads.flatMap(({ source, belongs }) => (source.data ?? []).filter(belongs))),
    read: invoiceReadState(reads.map(({ source }) => source)),
  };
}

/** A read this house needs, and which of its rows are this house's. */
interface HouseRead {
  source: InvoiceReadSource;
  belongs: (row: Invoice) => boolean;
}

function ownRead(projectId: string | null, project: InvoiceReadSource | undefined): HouseRead[] {
  return projectId
    ? [{ source: project ?? UNREAD, belongs: (row) => row.project_id === projectId }]
    : [];
}

function studioRead(holdsStudio: boolean, client: InvoiceReadSource | undefined): HouseRead[] {
  return holdsStudio ? [{ source: client ?? UNREAD, belongs: (row) => row.project_id === null }] : [];
}

// ── the projection ───────────────────────────────────────────────────────────

/** Primary groups, in precedence order: an invoice stands in the first that applies. */
export type InvoiceGroup = 'review' | 'processing' | 'payable' | 'history';

/** Holds the checkout boundary returned for an invoice, by its stable code. */
export type InvoiceServerHold = 'payment_processing' | 'payment_reconciliation_required';

/** Why an invoice is held for review. The last two are contradictory evidence. */
export type InvoiceReviewReason =
  | 'requires_refund'
  | 'reconciliation_hold'
  | 'paid_with_balance'
  | 'unknown_status';

export type InvoiceDueState = 'past_due' | 'due_today' | 'upcoming';

export interface InvoiceRow {
  /** The record, unchanged. */
  invoice: Invoice;
  group: InvoiceGroup;
  /** `invoiceBalanceCents` — integer cents still owed. */
  balanceCents: number;
  /** Upper-case ISO code; a missing one reads as the server's own `coalesce(currency, 'USD')` (00397). */
  currency: string;
  /** Empty outside `review`. */
  reviewReasons: InvoiceReviewReason[];
  /** Paid status with a balance, or a status this surface does not know. */
  contradictory: boolean;
  /** A pending payment carries a PaymentIntent (00636), or checkout answered `payment_processing`. Kept as a fact on a review row too. */
  paymentInFlight: boolean;
  /** False when the row arrived without its payments: unknown, never "nothing in flight". */
  paymentsRead: boolean;
  /** History only: `paid` on paid status, otherwise `no_balance_due`. */
  settled: 'paid' | 'no_balance_due' | null;
  /** The due date as a local calendar day; null when missing or unreadable. */
  dueDate: Date | null;
  /** Against `today`, by calendar day. Null in history or without a due date. */
  dueState: InvoiceDueState | null;
  /** Drawn against no project (ruling S1). */
  studio: boolean;
}

export interface InvoiceCurrencyTotal {
  currency: string;
  cents: number;
  invoiceCount: number;
}

/**
 * loading       — counts and totals withheld until the reads return.
 * incomplete    — a read failed or is stale: counts and totals withheld.
 * unverified    — a row arrived without its payments, so its group is unproven:
 *                 counts withheld; the balance total still stands.
 * contradictory — evidence disagrees: counts stand; the total is withheld.
 */
export type InvoiceFiguresWithheld = 'loading' | 'incomplete' | 'unverified' | 'contradictory';

export interface InvoiceProjection {
  read: InvoiceReadState;
  /** Each group sorted: outstanding by due date, history by most recent first. */
  review: InvoiceRow[];
  processing: InvoiceRow[];
  payable: InvoiceRow[];
  history: InvoiceRow[];
  /** review + processing + payable, in due-date order. */
  outstanding: InvoiceRow[];
  /** Per-group counts; null unless the reads are complete and every row's payments were read. */
  counts: Record<InvoiceGroup, number> | null;
  /** Outstanding balance per currency, never summed across currencies; null unless complete and consistent. */
  outstandingTotals: InvoiceCurrencyTotal[] | null;
  /** The first reason anything is withheld; `counts` and `outstandingTotals` say what is. */
  withheld: InvoiceFiguresWithheld | null;
  /** "No invoices to pay." may be said: counts stand and the payable group is empty. */
  nothingToPay: boolean;
  /** Nothing outstanding at all, and the reads say so. */
  allClear: boolean;
}

export interface InvoiceProjectionOptions {
  /** The calendar day due dates are read against. */
  today: Date;
  read: InvoiceReadState;
  /** Holds the checkout boundary returned this session, by invoice id. */
  serverHolds?: Readonly<Record<string, InvoiceServerHold>>;
}

const KNOWN_STATUSES = new Set<string>(['sent', 'partially_paid', 'paid']);
const OPEN_STATUSES = new Set<string>(['sent', 'partially_paid']);

function currencyOf(invoice: Invoice): string {
  const code = typeof invoice.currency === 'string' ? invoice.currency.trim() : '';
  return (code || 'USD').toUpperCase();
}

function dueStateOf(due: Date | null, today: Date): InvoiceDueState | null {
  if (!due) return null;
  const days = calendarDayOrdinal(due) - calendarDayOrdinal(today);
  if (days < 0) return 'past_due';
  return days === 0 ? 'due_today' : 'upcoming';
}

type Payment = NonNullable<Invoice['payments']>[number];

/**
 * 00636 (resolve_invoice_link, Review F3): only a pending row with a stamped
 * PaymentIntent is money in flight. Without one it is a claim nobody paid — an
 * abandoned or new Checkout — and a checkout-session id alone proves nothing.
 */
function intentPending(payment: Payment): boolean {
  return payment.status === 'pending' && payment.stripe_payment_intent_id != null;
}

function paymentFacts(invoice: Invoice, hold: InvoiceServerHold | undefined) {
  const paymentsRead = Array.isArray(invoice.payments);
  const payments: Payment[] = paymentsRead ? (invoice.payments as Payment[]) : [];
  return {
    paymentsRead,
    requiresRefund: payments.some((payment) => payment.status === 'requires_refund'),
    paymentInFlight: payments.some(intentPending) || hold === 'payment_processing',
  };
}

/** Evidence the status and the balance cannot both be true of. */
function contradictionOf(invoice: Invoice, balanceCents: number): InvoiceReviewReason | null {
  if (!KNOWN_STATUSES.has(invoice.status)) return 'unknown_status';
  return invoice.status === 'paid' && balanceCents > 0 ? 'paid_with_balance' : null;
}

function reviewReasonsOf(
  requiresRefund: boolean,
  hold: InvoiceServerHold | undefined,
  contradiction: InvoiceReviewReason | null,
): InvoiceReviewReason[] {
  const reasons: InvoiceReviewReason[] = [];
  if (requiresRefund) reasons.push('requires_refund');
  if (hold === 'payment_reconciliation_required') reasons.push('reconciliation_hold');
  if (contradiction) reasons.push(contradiction);
  return reasons;
}

/** Precedence: review → processing → payable → history. */
function groupOf(
  invoice: Invoice,
  balanceCents: number,
  reviewReasons: readonly InvoiceReviewReason[],
  paymentInFlight: boolean,
): InvoiceGroup {
  if (reviewReasons.length > 0) return 'review';
  if (paymentInFlight) return 'processing';
  return OPEN_STATUSES.has(invoice.status) && balanceCents > 0 ? 'payable' : 'history';
}

/** Paid only on paid evidence; any other settled row simply has no balance due. */
function settledOf(invoice: Invoice): 'paid' | 'no_balance_due' {
  return invoice.status === 'paid' ? 'paid' : 'no_balance_due';
}

function toRow(invoice: Invoice, today: Date, hold: InvoiceServerHold | undefined): InvoiceRow {
  const balanceCents = invoiceBalanceCents(invoice);
  const facts = paymentFacts(invoice, hold);
  const contradiction = contradictionOf(invoice, balanceCents);
  const reviewReasons = reviewReasonsOf(facts.requiresRefund, hold, contradiction);
  const group = groupOf(invoice, balanceCents, reviewReasons, facts.paymentInFlight);
  const inHistory = group === 'history';
  const dueDate = parseSourceDate(invoice.due_date);
  return {
    invoice,
    group,
    balanceCents,
    currency: currencyOf(invoice),
    reviewReasons,
    contradictory: contradiction !== null,
    paymentInFlight: facts.paymentInFlight,
    paymentsRead: facts.paymentsRead,
    settled: inHistory ? settledOf(invoice) : null,
    dueDate,
    dueState: inHistory ? null : dueStateOf(dueDate, today),
    studio: invoice.project_id === null,
  };
}

/** The first readable moment among the candidates, in order. */
function firstMoment(...values: (string | null | undefined)[]): number | null {
  for (const value of values) {
    const parsed = parseSourceDate(value);
    if (parsed) return parsed.getTime();
  }
  return null;
}

/** Ascending, or descending when `direction` is -1; a missing moment always last. */
function byMoment(left: number | null, right: number | null, direction: 1 | -1): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (left - right) * direction;
}

function byId(left: InvoiceRow, right: InvoiceRow): number {
  if (left.invoice.id === right.invoice.id) return 0;
  return left.invoice.id < right.invoice.id ? -1 : 1;
}

/** Due date ascending; then issue, sent, created ascending; then id. */
function outstandingOrder(left: InvoiceRow, right: InvoiceRow): number {
  const a = left.invoice;
  const b = right.invoice;
  return (
    byMoment(left.dueDate?.getTime() ?? null, right.dueDate?.getTime() ?? null, 1) ||
    byMoment(
      firstMoment(a.issue_date, a.sent_at, a.created_at),
      firstMoment(b.issue_date, b.sent_at, b.created_at),
      1,
    ) ||
    byId(left, right)
  );
}

/** Paid, sent, created — most recent first; then id. */
function historyOrder(left: InvoiceRow, right: InvoiceRow): number {
  const a = left.invoice;
  const b = right.invoice;
  return (
    byMoment(
      firstMoment(a.paid_at, a.sent_at, a.created_at),
      firstMoment(b.paid_at, b.sent_at, b.created_at),
      -1,
    ) || byId(left, right)
  );
}

function totalsByCurrency(rows: readonly InvoiceRow[]): InvoiceCurrencyTotal[] {
  const totals = new Map<string, InvoiceCurrencyTotal>();
  for (const row of rows) {
    if (row.balanceCents <= 0) continue;
    const total = totals.get(row.currency) ?? { currency: row.currency, cents: 0, invoiceCount: 0 };
    total.cents += row.balanceCents;
    total.invoiceCount += 1;
    totals.set(row.currency, total);
  }
  return [...totals.values()].sort((a, b) => (a.currency < b.currency ? -1 : 1));
}

/**
 * The projection every invoice surface reads. Visible invoices only, each id
 * once, each in exactly one group by precedence review → processing → payable
 * → history. Counts and totals are withheld rather than understated when the
 * reads or the evidence cannot support them.
 */
export function invoiceProjection(
  invoices: readonly Invoice[],
  { today, read, serverHolds }: InvoiceProjectionOptions,
): InvoiceProjection {
  const rows = uniqueVisible(invoices).map((invoice) =>
    toRow(invoice, today, serverHolds?.[invoice.id]),
  );
  const inGroup = (group: InvoiceGroup) => rows.filter((row) => row.group === group);
  const review = inGroup('review').sort(outstandingOrder);
  const processing = inGroup('processing').sort(outstandingOrder);
  const payable = inGroup('payable').sort(outstandingOrder);
  const history = inGroup('history').sort(historyOrder);
  const outstanding = [...review, ...processing, ...payable].sort(outstandingOrder);
  const trust = trustOf(read, rows);
  const counts = trust.countable
    ? {
        review: review.length,
        processing: processing.length,
        payable: payable.length,
        history: history.length,
      }
    : null;

  return {
    read,
    review,
    processing,
    payable,
    history,
    outstanding,
    counts,
    outstandingTotals: trust.totalable ? totalsByCurrency(outstanding) : null,
    withheld: trust.withheld,
    nothingToPay: trust.countable && payable.length === 0,
    allClear: trust.countable && outstanding.length === 0,
  };
}

/**
 * Which figures the read can stand behind. Counts need every row's payment
 * evidence (a missing payments join could hide a held payment that moves a row
 * between groups); totals need only consistent balances, which payment evidence
 * cannot change.
 */
function trustOf(read: InvoiceReadState, rows: readonly InvoiceRow[]) {
  const complete = read === 'complete';
  const evidenceRead = rows.every((row) => row.paymentsRead);
  const consistent = !rows.some((row) => row.contradictory);
  return {
    countable: complete && evidenceRead,
    totalable: complete && consistent,
    withheld: withheldOf(read, evidenceRead, consistent),
  };
}

function withheldOf(
  read: InvoiceReadState,
  evidenceRead: boolean,
  consistent: boolean,
): InvoiceFiguresWithheld | null {
  if (read === 'loading') return 'loading';
  if (read !== 'complete') return 'incomplete';
  if (!evidenceRead) return 'unverified';
  return consistent ? null : 'contradictory';
}
