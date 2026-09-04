'use client';

import { useState } from 'react';

import type { Invoice } from '@patina/supabase';
import { invoiceBalanceCents } from '@patina/shared';

import { ScoredAction } from '@/components/threshold/instruments/scored-action';
import { moneyInWords } from '@/components/threshold/instruments/standing-sentence';
import { visibleInvoices } from '@/app/budget/rollup';
import { parseSourceDate, type InvoiceModel } from '@/lib/threshold/derive';

import { Settlement } from './settlement';

/* ── EARLIER INVOICES ────────────────────────────────────────────────────────
   The letterbox holds one letter. Everything that came before it is kept, and
   folded away: a dated line each, in the order they arrived, newest first.

   `visibleInvoices` decides what counts — the same reader /budget uses, so the
   house and the budget page can never disagree about which invoices exist.
   Each line can be printed, and printing opens the invoice's own printable
   sheet in a new tab: a print is a document, not chrome, so it keeps its
   route.

   A line that is still owed is not only a record. The letterbox holds the
   soonest-due letter; a studio that sent two can be paid for both, and the
   second one settles here — the same ceremony, unfolded on its own line, so
   retiring `/invoices/[id]` strands no balance. ──────────────────────────── */

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

/** Still owed: the house may be asked for money on it. */
function isOpen(invoice: Invoice): boolean {
  return (
    (invoice.status === 'sent' || invoice.status === 'partially_paid') &&
    invoiceBalanceCents(invoice) > 0
  );
}

/** The row as the toll reads it — the same arithmetic every money surface runs. */
function toModel(invoice: Invoice): InvoiceModel {
  return {
    id: invoice.id,
    number: invoice.invoice_number,
    totalCents: invoice.total_cents || 0,
    paidCents: invoice.amount_paid_cents || 0,
    balanceCents: invoiceBalanceCents(invoice),
    dueDate: invoice.due_date,
  };
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

function byArrival(a: Invoice, b: Invoice): number {
  const left = parseSourceDate(a.sent_at ?? a.created_at)?.getTime() ?? 0;
  const right = parseSourceDate(b.sent_at ?? b.created_at)?.getTime() ?? 0;
  return right - left;
}

export interface EarlierInvoicesProps {
  /** Every invoice on the project; drafts and voids are dropped here. */
  invoices: Invoice[];
  /** The one standing in the letterbox — it is not also kept behind it. */
  exceptId?: string | null;
  /** Who a check would be coming to, when a line here is settled. */
  designerName?: string | null;
  /**
   * A letter whose own return from the till is still unconfirmed. Its settle
   * act is withheld, the same rule the letterbox keeps for the letter in the
   * slot — a second attempt on an unconfirmed payment is refused anyway.
   */
  heldInvoiceId?: string | null;
  /** Re-read the invoices after an attempt that ended in a fact, not a session. */
  onRefetch?: () => void | Promise<unknown>;
  today?: Date;
}

export function EarlierInvoices({
  invoices,
  exceptId,
  designerName,
  heldInvoiceId = null,
  onRefetch,
  today,
}: EarlierInvoicesProps) {
  const [open, setOpen] = useState(false);
  const [settling, setSettling] = useState<string | null>(null);

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
                      )} · ${receiptTrail(invoice, today)}`}
                    </span>
                    <span className="flex flex-wrap items-baseline gap-x-4">
                      {isOpen(invoice) && (
                        <ScoredAction
                          actionKey="invoice_settle"
                          regionKey="letterbox"
                          surfaceKey="the_threshold"
                          variant="secondary"
                          aria-expanded={settling === invoice.id}
                          aria-controls={`earlier-invoice-settle-${invoice.id}`}
                          onClick={() =>
                            setSettling((was) => (was === invoice.id ? null : invoice.id))
                          }
                        >
                          {settling === invoice.id ? 'Close this letter' : 'Settle this balance'}
                        </ScoredAction>
                      )}
                      <ScoredAction
                        actionKey="invoice_print"
                        regionKey="letterbox"
                        surfaceKey="the_threshold"
                        variant="tertiary"
                        href={`/invoices/${invoice.id}/print`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Print
                      </ScoredAction>
                    </span>
                  </div>

                  {isOpen(invoice) && (
                    <div
                      id={`earlier-invoice-settle-${invoice.id}`}
                      className={`grid overflow-hidden motion-safe:transition-[grid-template-rows] motion-safe:duration-[420ms] ${
                        settling === invoice.id ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                      }`}
                    >
                      <div className="min-h-0">
                        {settling === invoice.id && (
                          <Settlement
                            invoice={toModel(invoice)}
                            currency={invoice.currency || 'USD'}
                            hold={heldInvoiceId === invoice.id}
                            designerName={
                              invoice.designer?.full_name?.trim() ||
                              invoice.designer?.business_name?.trim() ||
                              designerName?.trim() ||
                              'your designer'
                            }
                            onRefetch={onRefetch}
                            today={today}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
