'use client';

import { useInvoiceLink, type Invoice } from '@patina/supabase';
import { invoiceLinkPath } from '@patina/utils';

import { ScoredAction } from '@/components/threshold/instruments/scored-action';
import { moneyInWords } from '@/components/threshold/instruments/standing-sentence';
import { useNamedInvoice } from '@/lib/threshold/checkout-return';
import {
  parseSourceDate,
  toInvoiceModel,
  type InvoiceModel,
} from '@/lib/threshold/derive';

import { EarlierInvoices } from './earlier-invoices';

/* ── The letterbox ──────────────────────────────────────────────────────────
   One letter, standing half out of the slot. The drawing states the fact
   before a word is read: something has come, and it has not been taken in.

   The letter's own act now lives at its own address (00574 · K1): "Open the
   invoice" takes the reader to `/pay/<token>`, the whole invoice — letterhead,
   lines, totals, memo, payments, and the toll to settle it — on a page that
   needs no account. The letterbox states the same figures in the
   accountant's order (number, total, paid, balance, due) so the fact can be
   read here without leaving the page, but the act of paying is the invoice's
   own now: settle-in-place and the printable sheet were retired together in
   W3b once that page could carry both. A return from the till lands there
   too — the letterbox no longer reads `?checkout=`; the road keeps its own.

   An empty letterbox is drawn as an empty letterbox. It is not hidden, and it
   carries no "no invoices" card: the slot with nothing in it IS the state.

   Never `data-dimmable`, and marked `data-never-dim`: an ancestor's opacity
   would take the letter down with it, and money owed is exactly what the
   since-yesterday reading must not hide. ─────────────────────────────────── */

const LONG_MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });
const LONG_MONTH_DAY_YEAR = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

export interface LetterboxProps {
  /** The soonest-due open invoice, or null when nothing has come. */
  invoice: InvoiceModel | null;
  /** Every invoice on the project — what is kept behind the one letter. */
  invoices?: Invoice[];
  /**
   * Today, for deciding whether the due date needs its year spelled out — the
   * same rule every date on this page keeps. Omitted during SSR and the
   * first client paint, which simply drops the year.
   */
  today?: Date;
}

/** "August 15", and the year too, once it is not this year. */
function formatDue(dueDate: string | null, today?: Date): string | null {
  const due = parseSourceDate(dueDate);
  if (!due) return null;
  return today && today.getFullYear() !== due.getFullYear()
    ? LONG_MONTH_DAY_YEAR.format(due)
    : LONG_MONTH_DAY.format(due);
}

function Drawing({ full }: { full: boolean }) {
  return (
    <svg
      role="img"
      aria-label={
        full ? 'A letterbox with an invoice standing half out of the slot' : 'An empty letterbox'
      }
      viewBox="0 0 300 96"
      className="mb-2.5 block h-auto w-full max-w-[280px] fill-none stroke-current stroke-1 text-[var(--text-primary)]"
    >
      {/* The box first, then the letter over it — the letter has to occlude the
          slot to read as standing out of it. */}
      <rect x="10" y="34" width="280" height="52" />
      <line x1="26" y1="52" x2="274" y2="52" />
      {full && (
        <>
          <rect
            x="74"
            y="6"
            width="150"
            height="44"
            className="fill-[var(--bg-surface)] stroke-none"
          />
          <rect x="74" y="6" width="150" height="44" />
          <line x1="86" y1="18" x2="196" y2="18" />
          <line x1="86" y1="28" x2="176" y2="28" />
          <line x1="86" y1="38" x2="150" y2="38" />
        </>
      )}
    </svg>
  );
}

export function Letterbox({
  invoice: soonestDue,
  invoices = [],
  today,
}: LetterboxProps) {
  // A mailed `/invoices/<id>` folds to `?invoice=<id>`, and the letter it
  // names is the one the client came to read — not the soonest-due one the
  // model would otherwise pick. An id this house is not holding names nothing
  // and changes nothing: the slot never states a letter it has no row for.
  const namedId = useNamedInvoice();
  const namedRow = namedId ? (invoices.find((row) => row.id === namedId) ?? null) : null;
  const invoice = namedRow ? toInvoiceModel(namedRow) : soonestDue;
  const due = invoice ? formatDue(invoice.dueDate, today) : null;

  // The letter's own address (00574 · K1) — the whole invoice on one page, and
  // the till on it. This is the letter's only act now (W3b).
  // `/pay/[token]` is a route of this very portal, so the root-relative path is
  // the whole address: correct on the server and the client alike, with no
  // origin to read and nothing to reconcile at hydration.
  const { data: invoiceLink } = useInvoiceLink(invoice?.id ?? null);

  // The row behind the model: the currency the figures are quoted in, and the
  // studio a check would be made out to. That studio is the LETTER's, not the
  // surrounding house's: a studio invoice stands in the adopted house, which
  // may belong to a different studio than the one that drew it.
  const row = invoice ? (invoices.find((candidate) => candidate.id === invoice.id) ?? null) : null;

  // A letter for no house at all (ruling S1). It stands in this letterbox
  // because this is the adopted house, not because the work is here, and it
  // says so on its own line rather than letting the plate above imply it. Its
  // regarding line stands where a house name would.
  const fromTheStudio = row !== null && row.project_id === null;
  const regarding = fromTheStudio ? row.title?.trim() || null : null;

  return (
    <div
      id="letterbox"
      data-threshold-unit="letterbox"
      data-never-dim
      data-testid="letterbox"
      className="border-t border-[var(--border-default)] pt-3"
    >
      <p className="mb-2 font-mono text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]">
        The letterbox
      </p>

      <Drawing full={invoice !== null} />

      {invoice ? (
        <>
          {fromTheStudio && (
            <p
              data-testid="letterbox-from-studio"
              className="max-w-[46ch] text-[15px] leading-[1.62] text-[var(--text-muted)]"
            >
              From the studio &middot; not for a house
            </p>
          )}
          {regarding && (
            <p
              data-testid="letterbox-regarding"
              className="max-w-[46ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
            >
              {regarding}
            </p>
          )}
          <p
            data-testid="letterbox-body"
            className="max-w-[46ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
          >
            {`${invoice.number ?? 'Invoice'} · ${moneyInWords(invoice.totalCents)} total · ${moneyInWords(
              invoice.paidCents,
            )} paid. Balance ${moneyInWords(invoice.balanceCents)}${due ? `, due ${due}` : ''}.`}
          </p>

          {invoiceLink && (
            <div className="mt-3.5 flex flex-wrap items-baseline gap-x-4">
              <ScoredAction
                actionKey="invoice_open_link"
                regionKey="letterbox"
                surfaceKey="the_threshold"
                variant="primary"
                href={invoiceLinkPath(invoiceLink.token)}
                // Never warmed by scrolling past: a prefetch that ever renders
                // would record a view and spend the pay page's rate-limit
                // budget on a letter nobody opened.
                prefetch={false}
              >
                Open the invoice
              </ScoredAction>
            </div>
          )}
        </>
      ) : (
        <p
          data-testid="letterbox-body"
          className="max-w-[46ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          Nothing in the letterbox.
        </p>
      )}

      <EarlierInvoices
        invoices={invoices}
        exceptId={invoice?.id ?? null}
        today={today}
      />
    </div>
  );
}
