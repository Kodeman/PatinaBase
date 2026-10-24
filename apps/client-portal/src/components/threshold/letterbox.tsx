'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { urgentInvoice } from '@/lib/threshold/asks-line';
import { galleryInvoiceReceipt } from '@/lib/threshold/gallery-invoices';
import { GalleryInvoiceList } from './gallery-invoice-list';

import { type Invoice } from '@patina/supabase';
import { invoiceBalanceCents } from '@patina/shared';

import { countInWords } from '@/components/threshold/instruments/standing-sentence';
import { ScoredAction } from '@/components/threshold/instruments/scored-action';
import { clientEvents } from '@/lib/analytics/events';
import {
  revealReturnAnchor,
  useCheckoutConfirmation,
  useCheckoutReturn,
  useNamedInvoice,
} from '@/lib/threshold/checkout-return';
import type { InvoiceModel } from '@/lib/threshold/derive';
import {
  invoiceProjection,
  retireSettledHolds,
  type InvoiceFiguresWithheld,
  type InvoiceProjection,
  type InvoiceRow,
  withHold,
  type InvoiceHolds,
  type InvoiceServerHold,
} from '@/lib/threshold/invoice-rollup';

import {
  InvoiceGroupList,
  invoiceDomIds,
  invoiceMoney,
  PaymentHistory,
  type InvoiceListState,
} from './earlier-invoices';

/* ── The invoices (US-45 CPUX-02 layout, CPUX-03) ────────────────────────────
   Every invoice the house is holding, read from the one invoice projection:
   what is to pay, what is in progress, what needs review, each in plain view,
   then the total outstanding per currency and the payment history behind the
   only fold. Each row's "View invoice" opens its details in place; one row is
   open at a time, and opening never touches the server.

   Holds the checkout boundary returns, and checks the studio has been told
   are coming, are kept here by invoice id and handed to the owner, so closing
   a row, opening another or reopening it forgets none of them. A return from
   the till confirms nothing by itself: the receipt line waits for the row.

   Marked `data-never-dim`: an ancestor's opacity would take money owed down
   with it, and that is exactly what the since-yesterday reading must not
   hide. ─────────────────────────────────────────────────────────────────── */

export interface LetterboxProps {
  /** The invoice projection the page reads. Built here from `invoices` when absent. */
  projection?: InvoiceProjection;
  /** Every invoice on the project — read only when no projection is handed in. */
  invoices?: Invoice[];
  /** Retained for existing callers; the projection decides what is shown. */
  invoice?: InvoiceModel | null;
  /** The designer, as the studio's sentences name them. */
  designerName?: string | null;
  /**
   * Re-read the project's invoices. Polled while a return from the till is
   * waiting for the webhook, taken after an attempt that ended in a standing
   * fact, and behind every Retry.
   */
  onRefetch?: () => void | Promise<unknown>;
  /** Today, for due-state reckoning when the projection is built here. */
  today?: Date;
  /** A hold the checkout boundary returned, for the owner's projection. Never cleared on refetch. */
  onHold?: (invoiceId: string, hold: InvoiceServerHold) => void;
  /** The house the list stands in: the eyebrow and the total's scope. */
  projectName?: string | null;
  /** Gallery changes placement only; the invoice/payment owner stays here. */
  gallery?: { approvals: ReactNode };
}

const EPOCH = new Date(0);
const NO_INVOICES: Invoice[] = [];

type PendingFocus = { id: string; target: 'heading' | 'toggle' | 'reveal' };

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Six invoices, soonest due first." Only a counted list says how many. */
function countSentence(count: number | null | undefined, order: string): string | null {
  if (count === null || count === undefined || count < 2) return null;
  return `${capitalised(countInWords(count))} invoices, ${order}.`;
}

type ReadNoticeKind = 'failed' | 'partial' | 'stale' | 'unverified';

const READ_SENTENCE: Record<ReadNoticeKind, string> = {
  failed: 'We couldn’t load your invoices.',
  partial:
    'Some invoices didn’t load, so this list may be incomplete. The total is hidden until everything loads.',
  stale: 'We couldn’t refresh your invoices. These may be out of date.',
  unverified:
    'We couldn’t load the payment status of every invoice. An invoice whose status didn’t load can’t be paid here yet.',
};

/** A read that fell short says so; a complete one can still be missing a row's payments. */
function noticeOf(
  read: Exclude<InvoiceProjection['read'], 'loading'>,
  withheld: InvoiceProjection['withheld'],
): ReadNoticeKind | null {
  if (read !== 'complete') return read;
  return withheld === 'unverified' ? withheld : null;
}

function ReadNotice({
  read,
  withheld,
  onRetry,
}: {
  read: InvoiceProjection['read'];
  withheld: InvoiceProjection['withheld'];
  onRetry?: () => void | Promise<unknown>;
}) {
  if (read === 'loading') {
    return (
      <p role="status" data-testid="letterbox-read-notice" data-read={read} className="t-body">
        Loading your invoices.
      </p>
    );
  }
  const notice = noticeOf(read, withheld);
  if (!notice) return null;
  const sentence = READ_SENTENCE[notice];
  return (
    <div
      role="status"
      data-testid="letterbox-read-notice"
      data-read={notice}
      className="cp-note flex flex-col items-start gap-2"
    >
      <p className="text-[16px] leading-[1.55]">{sentence}</p>
      {onRetry && (
        <ScoredAction
          actionKey="invoices_retry"
          regionKey="letterbox"
          surfaceKey="the_threshold"
          variant="secondary"
          onClick={() => void onRetry()}
        >
          Retry
        </ScoredAction>
      )}
    </div>
  );
}

function OutstandingTotal({
  projection,
  mixed,
  scope,
}: {
  projection: InvoiceProjection;
  mixed: boolean;
  scope: string;
}) {
  if (projection.outstanding.length === 0) return null;
  const totals = projection.outstandingTotals;
  if (!totals) return <WithheldTotal withheld={projection.withheld} />;
  const amounts = totals.map((total) =>
    invoiceMoney(total.cents, total.currency, mixed),
  );
  const held = projection.processing.length + projection.review.length > 0;
  return (
    <div data-testid="letterbox-total" className="flex flex-col gap-1">
      <p className="text-[16px] font-medium leading-[1.5] text-[var(--text-primary)]">Total outstanding</p>
      {amounts.map((amount, index) => (
        <p
          key={totals[index].currency}
          data-testid="letterbox-total-amount"
          data-currency={totals[index].currency}
          className="font-mono text-[20px] leading-[1.4] tabular-nums text-[var(--text-primary)]"
        >
          {amount}
        </p>
      ))}
      <p className="text-[15px] leading-[1.5] text-[var(--text-body)]">{totalScope(amounts, scope, held)}</p>
    </div>
  );
}

/** What the total covers: its scope, and whether held payments are inside it. */
function totalScope(amounts: readonly string[], scope: string, held: boolean): string {
  const across =
    amounts.length === 1
      ? `${amounts[0]} across ${scope}.`
      : `Across ${scope}. Each currency is totalled on its own.`;
  const counted = held
    ? 'Each invoice is counted once, including payments in progress and under review.'
    : 'It counts only the invoices shown here.';
  return `${across} ${counted}`;
}

const WITHHELD_REASON: Partial<Record<InvoiceFiguresWithheld, string>> = {
  incomplete: 'The total is hidden until every invoice loads.',
  contradictory: 'The total is hidden until every invoice’s payment status is confirmed.',
};

/** A total that cannot stand says why, where one can be given. */
function WithheldTotal({ withheld }: { withheld: InvoiceFiguresWithheld | null }) {
  const reason = withheld ? WITHHELD_REASON[withheld] : undefined;
  if (!reason) return null;
  return (
    <div data-testid="letterbox-total" data-withheld={withheld} className="flex flex-col gap-1">
      <p className="text-[16px] font-medium leading-[1.5] text-[var(--text-primary)]">Total outstanding</p>
      <p className="text-[15px] leading-[1.5] text-[var(--text-body)]">{reason}</p>
    </div>
  );
}

function PayableInvoices({ projection, state }: { projection: InvoiceProjection; state: InvoiceListState }) {
  const { counts } = projection;
  return <>      {projection.payable.length > 0 ? (
        <InvoiceGroupList
          testId="invoices-to-pay"
          heading="Invoices to pay"
          summary={countSentence(counts?.payable, 'soonest due first')}
          rows={projection.payable}
          state={state}
        />
      ) : (
        projection.nothingToPay && (
          <section data-testid="invoices-to-pay" aria-label="Invoices to pay" className="flex flex-col gap-1">
            <h3 className="text-[18px] font-medium leading-[1.4] text-[var(--text-primary)]">
              Invoices to pay
            </h3>
            <p data-testid="invoices-none" className="t-body text-[var(--text-primary)]">
              No invoices to pay.
            </p>
          </section>
        )
      )}</>;
}

function InvoiceContents({ projection, state, gallery, mixedCurrency, scope }: {
  projection: InvoiceProjection; state: InvoiceListState; gallery: LetterboxProps['gallery']; mixedCurrency: boolean; scope: string;
}) {
  if (gallery) return <GalleryInvoiceList projection={projection} state={state} approvals={gallery.approvals} />;
  return <><PayableInvoices projection={projection} state={state} />

      {projection.processing.length > 0 && (
        <InvoiceGroupList
          testId="invoices-in-progress"
          heading="Payments in progress"
          rows={projection.processing}
          state={state}
        />
      )}

      {projection.review.length > 0 && (
        <InvoiceGroupList
          testId="invoices-under-review"
          heading="Payment needs review"
          rows={projection.review}
          state={state}
        />
      )}

      <OutstandingTotal projection={projection} mixed={mixedCurrency} scope={scope} /></>;
}

function settledReceipt(invoice: Invoice | null, gallery: boolean): string {
  const fact = gallery && invoice && galleryInvoiceReceipt(invoice);
  return fact || `${invoice?.invoice_number ?? 'Your invoice'} · Payment confirmed — thank you. Your invoice has been updated.`;
}

function confirmationLine(confirm: string | null, invoice: Invoice | null, gallery: boolean): string {
  if (confirm === 'confirmed') return settledReceipt(invoice, gallery);
  return confirm === 'unconfirmed'
    ? 'Checkout returned, but Patina has not confirmed a payment yet. Do not submit another payment until the status is known.'
    : 'Confirming payment… This usually takes a few seconds.';
}

function InvoiceReturnReceipt({ outcome, confirm, invoice, gallery }: {
  outcome: string; confirm: string | null; invoice: Invoice | null; gallery: boolean;
}) {
  return <p role="status" data-testid="letterbox-receipt" data-confirm={confirm ?? undefined}
    className="cp-note max-w-[56ch] text-[16px] leading-[1.55]">
    {outcome === 'settled' ? confirmationLine(confirm, invoice, gallery) : 'Nothing changed.'}
  </p>;
}

export function Letterbox({
  projection: handed,
  invoices = NO_INVOICES,
  designerName,
  onRefetch,
  today,
  onHold,
  projectName = null,
  gallery,
}: LetterboxProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [holds, setHolds] = useState<InvoiceHolds>({});
  const [checksExpected, setChecksExpected] = useState<Record<string, true>>({});
  const [announcement, setAnnouncement] = useState('');
  const pendingFocus = useRef<PendingFocus | null>(null);

  const projection = useMemo(
    () =>
      handed ??
      invoiceProjection(invoices, {
        today: today ?? EPOCH,
        read: 'complete',
        serverHolds: holds,
      }),
    [handed, invoices, today, holds],
  );
  // Proven settlement retires the hold here too; it feeds the row's act and notes.
  // Adjusted in render: the same holds come back when nothing retires.
  const standingHolds = retireSettledHolds(holds, projection);
  if (standingHolds !== holds) setHolds(standingHolds);
  const holdCodes = useMemo(
    () => Object.fromEntries(Object.entries(holds).map(([id, { hold }]) => [id, hold])),
    [holds],
  );
  const rows = useMemo(() => [...projection.outstanding, ...projection.history], [projection]);

  // The return from the till. A return that names an order belongs to the road,
  // and a return naming an invoice this house is not holding is not spoken to
  // at all: the house states no payment fact it cannot see a row for.
  const returned = useCheckoutReturn();
  const returnedRow =
    returned && !returned.orderId && returned.invoiceId
      ? (rows.find((row) => row.invoice.id === returned.invoiceId)?.invoice ?? null)
      : null;
  const settlement = returnedRow ? returned : null;

  // The row's own word, not the address's: `paid`, or nothing left to pay.
  const rowSettled = Boolean(
    returnedRow && (returnedRow.status === 'paid' || invoiceBalanceCents(returnedRow) <= 0),
  );
  const confirm = useCheckoutConfirmation(settlement?.outcome === 'settled', rowSettled, onRefetch);

  /* client_payment_completed counts money that MOVED, so it waits for the row
     — an abandoned ACH debit must never be counted as revenue. A cancellation
     is reported on the return itself, with no amount.

     J5 — currently unreachable, deliberately: both rails return through
     /pay/return/<nonce> to the guest sheet, which carries no `invoice`, so
     `settlement` stays null here and `payLinkEvents.paymentCompleted` on the
     guest sheet is the successor. Kept until the letterbox till retires. */
  const reported = useRef(false);
  useEffect(() => {
    if (!settlement || reported.current || !settlement.invoiceId) return;
    if (settlement.outcome === 'settled') {
      if (confirm !== 'confirmed') return;
      reported.current = true;
      clientEvents.paymentCompleted({ invoiceId: settlement.invoiceId });
      return;
    }
    reported.current = true;
    clientEvents.paymentCancelled({ invoiceId: settlement.invoiceId });
  }, [confirm, settlement]);

  const slot = useRef<HTMLDivElement | null>(null);
  const revealed = useRef(false);
  useEffect(() => {
    if (!settlement || revealed.current) return;
    revealed.current = true;
    revealReturnAnchor(slot.current);
  }, [settlement]);

  // A mailed `/invoices/<id>` folds to `?invoice=<id>`: that row opens, in
  // history too, and is brought into view. An id this house is not holding
  // names nothing and changes nothing.
  // It opens once, in the render that first holds its row, so the row never
  // paints closed first.
  const namedId = useNamedInvoice();
  const [namedOpened, setNamedOpened] = useState<string | null>(null);
  if (namedId && namedOpened === null) {
    const row = rows.find((candidate) => candidate.invoice.id === namedId);
    if (row) {
      setNamedOpened(namedId);
      if (row.group === 'history') setHistoryOpen(true);
      setOpenId(namedId);
    }
  }
  useEffect(() => {
    if (namedOpened) pendingFocus.current = { id: namedOpened, target: 'reveal' };
  }, [namedOpened]);

  // Focus moves after the render that mounted its target: into the details a
  // row opened, back to the row's own "View invoice" when they close.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const ids = invoiceDomIds(pending.id);
    if (pending.target === 'reveal') {
      const heading = document.getElementById(ids.heading);
      if (!heading) {
        pendingFocus.current = pending;
        return;
      }
      revealReturnAnchor(document.getElementById(ids.region));
      heading.focus();
      return;
    }
    document.getElementById(pending.target === 'heading' ? ids.heading : ids.toggle)?.focus();
  });

  const labelOf = (row: InvoiceRow) =>
    row.invoice.invoice_number?.trim() || row.invoice.title?.trim() || 'this invoice';
  const detailsOf = (row: InvoiceRow) =>
    row.group === 'history' ? 'Invoice details' : 'Payment details';

  const handleToggle = (row: InvoiceRow) => {
    const id = row.invoice.id;
    if (openId === id) {
      setOpenId(null);
      setAnnouncement(`${detailsOf(row)} for ${labelOf(row)} closed.`);
      return;
    }
    pendingFocus.current = { id, target: 'heading' };
    setOpenId(id);
    setAnnouncement(`${detailsOf(row)} for ${labelOf(row)} open. Opening them doesn’t pay anything.`);
  };

  const handleClose = (row: InvoiceRow) => {
    pendingFocus.current = { id: row.invoice.id, target: 'toggle' };
    setOpenId(null);
    setAnnouncement(`${detailsOf(row)} for ${labelOf(row)} closed.`);
  };

  const handleHold = useCallback(
    (invoiceId: string, hold: InvoiceServerHold) => {
      // The row may move to another group under the same id; focus follows it.
      pendingFocus.current = { id: invoiceId, target: 'heading' };
      const heldAt = Date.now();
      setHolds((was) => withHold(was, invoiceId, hold, heldAt));
      onHold?.(invoiceId, hold);
    },
    [onHold],
  );

  const mixedCurrency = new Set(rows.map((row) => row.currency)).size > 1;
  const house = projectName?.trim() || null;
  const anyStudio = rows.some((row) => row.studio);
  const outstandingStudio = projection.outstanding.some(
    (row) => row.studio,
  );
  const outstandingHouse = projection.outstanding.some(
    (row) => !row.studio,
  );
  const scope =
    outstandingStudio && outstandingHouse
      ? `${house ?? 'this house'} and your studio invoices`
      : outstandingStudio
        ? 'your studio invoices'
        : (house ?? 'these invoices');

  const state: InvoiceListState = {
    openId,
    onToggle: handleToggle,
    onClose: handleClose,
    holds: holdCodes,
    onHold: handleHold,
    checksExpected,
    onCheckExpected: (invoiceId) =>
      setChecksExpected(
        (was) => ({ ...was, [invoiceId]: true }),
      ),
    checkoutHeldId:
      confirm === 'confirming' || confirm === 'unconfirmed' ? (settlement?.invoiceId ?? null) : null,
    designerName: designerName?.trim() || 'your designer',
    projectName: house,
    mixedCurrency,
    onRefetch,
  };

  const { counts } = projection;
  const galleryOpened = useRef(false);
  const urgentId = urgentInvoice(projection)?.invoice.id;
  useEffect(() => {
    if (!gallery || galleryOpened.current || !urgentId) return;
    galleryOpened.current = true;
    setOpenId((was) => was ?? urgentId);
  }, [gallery, urgentId]);

  const receipt = settlement && <InvoiceReturnReceipt outcome={settlement.outcome} confirm={confirm} invoice={returnedRow} gallery={Boolean(gallery)} />;

  return (
    <div
      ref={slot}
      id="letterbox"
      data-threshold-unit="letterbox"
      data-never-dim
      data-testid="letterbox"
      className="flex flex-col gap-6"
    >
      {gallery && receipt}
      <div className="flex flex-col gap-1">
        {house && (
          <p data-testid="letterbox-eyebrow" className="text-[15px] leading-[1.5] text-[var(--text-body)]">
            {anyStudio ? `${house} and studio` : house}
          </p>
        )}
        <h2
          id="letterbox-heading"
          tabIndex={-1}
          className="text-[24px] font-medium leading-[1.3] text-[var(--text-primary)] focus:outline-none"
        >
          Invoices
        </h2>
      </div>

      {/* One polite region for the surface: opening or closing a row says so. */}
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>

      {!gallery && receipt}

      <ReadNotice read={projection.read} withheld={projection.withheld} onRetry={onRefetch} />

      <InvoiceContents projection={projection} state={state} gallery={gallery} mixedCurrency={mixedCurrency} scope={scope} />

      <PaymentHistory
        rows={projection.history}
        summary={countSentence(counts?.history, 'newest first')}
        open={historyOpen}
        onToggle={() =>
          setHistoryOpen(
            (was) => !was,
          )
        }
        state={state}
      />
    </div>
  );
}
