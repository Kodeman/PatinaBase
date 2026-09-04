'use client';

import { useState } from 'react';

import { parseSpineDate } from '@/components/making/making-spine';
import { ScoredAction } from '@/components/making/scored-action';
import { SpineToll } from '@/components/making/spine-toll';
import { moneyInWords } from '@/components/making/standing-sentence';
import type { InvoiceModel } from '@/lib/threshold/derive';

/* ── The letterbox ──────────────────────────────────────────────────────────
   One letter, standing half out of the slot. The drawing states the fact
   before a word is read: something has come, and it has not been taken in.

   Opening it unfolds The Making's own toll — the same three figures in the
   accountant's order and the same act to settle them — rather than a second
   invoice grammar invented here. The letterbox is the envelope; the toll is
   the letter, and there is only ever one of it on this surface.

   An empty letterbox is drawn as an empty letterbox. It is not hidden, and it
   carries no "no invoices" card: the slot with nothing in it IS the state.
   ────────────────────────────────────────────────────────────────────────── */

const LONG_MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });

export interface LetterboxProps {
  /** The soonest-due open invoice, or null when nothing has come. */
  invoice: InvoiceModel | null;
}

/** "August 15" — the surface's own date idiom, matching the toll's columns. */
function formatDue(dueDate: string | null): string | null {
  const due = dueDate ? parseSpineDate(dueDate) : null;
  return due ? LONG_MONTH_DAY.format(due) : null;
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
      {full && (
        <>
          <rect x="74" y="6" width="150" height="44" className="fill-[var(--bg-surface)] stroke-none" />
          <rect x="74" y="6" width="150" height="44" />
          <line x1="86" y1="18" x2="196" y2="18" />
          <line x1="86" y1="28" x2="176" y2="28" />
          <line x1="86" y1="38" x2="150" y2="38" />
        </>
      )}
      <rect x="10" y="34" width="280" height="52" />
      <line x1="26" y1="52" x2="274" y2="52" />
    </svg>
  );
}

export function Letterbox({ invoice }: LetterboxProps) {
  const [open, setOpen] = useState(false);
  const due = invoice ? formatDue(invoice.dueDate) : null;

  return (
    <div
      id="letterbox"
      data-threshold-unit="letterbox"
      data-testid="letterbox"
      className="border-t border-[var(--border-default)] pt-3"
    >
      <p className="mb-2 font-mono text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]">
        The letterbox
      </p>

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

          <div
            id="letterbox-letter"
            hidden={!open}
            className="motion-safe:transition-opacity motion-safe:duration-300"
          >
            {open && (
              <SpineToll
                invoiceId={invoice.id}
                invoiceNumber={invoice.number}
                totalCents={invoice.totalCents}
                paidCents={invoice.paidCents}
                dueDate={invoice.dueDate}
              />
            )}
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
    </div>
  );
}
