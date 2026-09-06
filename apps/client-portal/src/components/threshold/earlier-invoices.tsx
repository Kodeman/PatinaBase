'use client';

import { useState } from 'react';

import type { Invoice } from '@patina/supabase';
import { useInvoiceLink } from '@patina/supabase';
import { invoiceBalanceCents } from '@patina/shared';
import { invoiceLinkPath } from '@patina/utils';

import { ScoredAction } from '@/components/threshold/instruments/scored-action';
import { moneyInWords } from '@/components/threshold/instruments/standing-sentence';
import { visibleInvoices } from '@/lib/threshold/invoice-rollup';
import { parseSourceDate } from '@/lib/threshold/derive';

/* ── EARLIER INVOICES ────────────────────────────────────────────────────────
   The letterbox holds one letter. Everything that came before it is kept, and
   folded away: a dated line each, in the order they arrived, newest first.

   `visibleInvoices` decides what counts — the same reader /budget uses, so the
   house and the budget page can never disagree about which invoices exist.

   Each line carries its own address (00574 · K1): "Open the invoice" reaches
   the same standalone page the letter in the slot's own act points at,
   whether the line is still owed or stands only as a receipt. Settle-in-place
   and the printable sheet were retired together here in W3b, once that page
   could carry both for every invoice on the project, not only the one in the
   slot.

   A letter drawn against no house at all is folded away here too, because the
   adopted house holds it. It carries the same clause the envelope carries in
   the slot: a money line she can act on may never leave her to assume the
   work is hers. ─────────────────────────────────────────────────────────── */

const LONG_MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });
const LONG_MONTH_DAY_YEAR = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

/** "12 June" in the surface's own idiom, and the year too once it is not this one. */
function longDate(value: string | null | undefined, today?: Date): string | null {
  const date = parseSourceDate(value);
  if (!date) return null;
  return today && today.getFullYear() !== date.getFullYear()
    ? LONG_MONTH_DAY_YEAR.format(date)
    : LONG_MONTH_DAY.format(date);
}

/** What became of it, in one dated clause. */
function receiptTrail(invoice: Invoice, today?: Date): string {
  const balanceCents = invoiceBalanceCents(invoice);
  if (invoice.status === 'paid') {
    const paid = longDate(invoice.paid_at, today);
    return paid ? `paid ${paid}` : 'paid';
  }
  const due = longDate(invoice.due_date, today);
  if (invoice.status === 'partially_paid') {
    return due
      ? `${moneyInWords(balanceCents)} outstanding, due ${due}`
      : `${moneyInWords(balanceCents)} outstanding`;
  }
  if (due) return `due ${due}`;
  const sent = longDate(invoice.sent_at, today);
  return sent ? `sent ${sent}` : 'awaiting payment';
}

/** Where it came from, when it came from no house — the envelope's own clause. */
function origin(invoice: Invoice): string {
  return invoice.project_id === null ? ' · from the studio · not for a house' : '';
}

function byArrival(a: Invoice, b: Invoice): number {
  const left = parseSourceDate(a.sent_at ?? a.created_at)?.getTime() ?? 0;
  const right = parseSourceDate(b.sent_at ?? b.created_at)?.getTime() ?? 0;
  return right - left;
}

/* A folded letter's own address. `/pay` is a route of this very portal, so
   the root-relative path is the whole address: correct on the server and the
   client alike, with no origin to read. Its own `useInvoiceLink` per row,
   mounted whether the line is open or already settled — a plain link carries
   no state to gate behind a toggle, unlike the settle panel it replaces —
   but only once the disclosure below is open, so a threshold load never
   fires one of these per row in the project's history. Never warmed by
   scrolling past: a prefetch that ever renders would record a view and spend
   the pay page's rate-limit budget on a letter nobody opened, multiplied by
   every row at once. */
function FoldedInvoiceLink({ invoiceId }: { invoiceId: string }) {
  const { data: invoiceLink } = useInvoiceLink(invoiceId);
  if (!invoiceLink) return null;
  return (
    <ScoredAction
      actionKey="invoice_open_link"
      regionKey="letterbox"
      surfaceKey="the_threshold"
      variant="tertiary"
      href={invoiceLinkPath(invoiceLink.token)}
      prefetch={false}
    >
      Open the invoice
    </ScoredAction>
  );
}

export interface EarlierInvoicesProps {
  /** Every invoice on the project; drafts and voids are dropped here. */
  invoices: Invoice[];
  /** The one standing in the letterbox — it is not also kept behind it. */
  exceptId?: string | null;
  today?: Date;
}

export function EarlierInvoices({
  invoices,
  exceptId,
  today,
}: EarlierInvoicesProps) {
  const [open, setOpen] = useState(false);

  const earlier = visibleInvoices(invoices)
    .filter((invoice) => invoice.id !== exceptId)
    .sort(byArrival);

  if (earlier.length === 0) return null;

  return (
    <div className="mt-3.5" data-testid="earlier-invoices">
      <ScoredAction
        actionKey="earlier_invoices"
        regionKey="letterbox"
        surfaceKey="the_threshold"
        variant="secondary"
        aria-expanded={open}
        aria-controls="earlier-invoices-list"
        onClick={() => setOpen((was) => !was)}
      >
        {open ? 'Close earlier invoices' : 'Earlier invoices'}
      </ScoredAction>

      <div
        id="earlier-invoices-list"
        className={`grid overflow-hidden motion-safe:transition-[grid-template-rows] motion-safe:duration-[420ms] ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0">
          {open && (
            <ul className="mt-2 list-none">
              {earlier.map((invoice) => (
                <li
                  key={invoice.id}
                  data-earlier-invoice={invoice.id}
                  className="border-t border-[var(--border-subtle)] py-2 last:border-b"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-[15px] leading-[1.62] text-[var(--text-body)]">
                      {`${invoice.invoice_number ?? 'Invoice'} · ${moneyInWords(
                        invoice.total_cents || 0,
                        invoice.currency || 'USD',
                      )} · ${receiptTrail(invoice, today)}${origin(invoice)}`}
                    </span>
                    <FoldedInvoiceLink invoiceId={invoice.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
