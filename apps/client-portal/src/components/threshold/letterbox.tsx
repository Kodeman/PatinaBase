'use client';

import { useEffect, useRef, useState } from 'react';

import type { Invoice } from '@patina/supabase';

import { ScoredAction } from '@/components/making/scored-action';
import { moneyInWords } from '@/components/making/standing-sentence';
import { clientEvents } from '@/lib/analytics/events';
import { useCheckoutReturn } from '@/lib/threshold/checkout-return';
import { parseSourceDate, type InvoiceModel } from '@/lib/threshold/derive';

import { EarlierInvoices } from './earlier-invoices';
import { Settlement } from './settlement';

/* ── The letterbox ──────────────────────────────────────────────────────────
   One letter, standing half out of the slot. The drawing states the fact
   before a word is read: something has come, and it has not been taken in.

   Opening it unfolds The Making's own toll — the same three figures in the
   accountant's order and the same act to settle them — rather than a second
   invoice grammar invented here. The letterbox is the envelope; the toll is
   the letter, and there is only ever one of it on this surface. The toll does
   its own date formatting; `today` is threaded through so it can spell the
   year out on an invoice that falls in another one, and the summary line above
   it keeps exactly the same rule so the two cannot disagree.

   An empty letterbox is drawn as an empty letterbox. It is not hidden, and it
   carries no "no invoices" card: the slot with nothing in it IS the state.

   Never `data-dimmable`, and marked `data-never-dim`: an ancestor's opacity
   would take the open toll down with it, and money owed is exactly what the
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
  /** Who a check would be coming to. Falls back to the invoice's own designer. */
  designerName?: string | null;
  /**
   * Today, for deciding whether the due date needs its year spelled out — the
   * rule `SpineToll` applies. Omitted during SSR and the first client paint,
   * which simply drops the year.
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

export function Letterbox({ invoice, invoices = [], designerName, today }: LetterboxProps) {
  const [open, setOpen] = useState(false);
  const due = invoice ? formatDue(invoice.dueDate, today) : null;

  // The return from the till. A return that names an order belongs to the road,
  // not to the letterbox.
  const returned = useCheckoutReturn();
  const settlement = returned && !returned.orderId ? returned : null;

  const reported = useRef(false);
  useEffect(() => {
    if (!settlement || reported.current || !settlement.invoiceId) return;
    reported.current = true;
    if (settlement.outcome === 'settled') {
      clientEvents.paymentCompleted({ invoiceId: settlement.invoiceId });
    } else {
      clientEvents.paymentCancelled({ invoiceId: settlement.invoiceId });
    }
  }, [settlement]);

  // The row behind the model: the currency the figures are quoted in, and the
  // designer a check would be made out to.
  const row = invoice ? (invoices.find((candidate) => candidate.id === invoice.id) ?? null) : null;
  const studio =
    designerName?.trim() ||
    row?.designer?.full_name?.trim() ||
    row?.designer?.business_name?.trim() ||
    'your designer';

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

      {settlement && (
        <p
          role="status"
          data-testid="letterbox-receipt"
          className="mb-2 max-w-[46ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          {settlement.outcome === 'settled'
            ? `Paid ${LONG_MONTH_DAY.format(today ?? new Date())}. Receipt in your email.`
            : 'Nothing changed.'}
        </p>
      )}

      <Drawing full={invoice !== null} />

      {invoice ? (
        <>
          <p
            data-testid="letterbox-body"
            className="max-w-[46ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
          >
            {`${invoice.number ?? 'Invoice'} · ${moneyInWords(invoice.totalCents)} total · ${moneyInWords(
              invoice.paidCents,
            )} paid. Balance ${moneyInWords(invoice.balanceCents)}${due ? `, due ${due}` : ''}.`}
          </p>

          <div className="mt-3.5">
            <ScoredAction
              actionKey="letterbox_open"
              regionKey="letterbox"
              surfaceKey="the_threshold"
              variant="secondary"
              aria-expanded={open}
              aria-controls="letterbox-letter"
              onClick={() => setOpen((was) => !was)}
            >
              {open ? 'Close the letterbox' : 'Open the letterbox'}
            </ScoredAction>
          </div>

          {/* The unfold: a grid row opening from 0fr to 1fr, which is a real
              height transition on content of unknown height. Stilled under
              prefers-reduced-motion, where it simply appears. */}
          <div
            id="letterbox-letter"
            className={`grid overflow-hidden motion-safe:transition-[grid-template-rows] motion-safe:duration-[420ms] ${
              open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            }`}
          >
            <div className="min-h-0">
              {open && (
                <Settlement
                  invoice={invoice}
                  currency={row?.currency || 'USD'}
                  designerName={studio}
                  today={today}
                />
              )}
            </div>
          </div>
        </>
      ) : (
        <p
          data-testid="letterbox-body"
          className="max-w-[46ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          Nothing in the letterbox.
        </p>
      )}

      <EarlierInvoices invoices={invoices} exceptId={invoice?.id ?? null} today={today} />
    </div>
  );
}
