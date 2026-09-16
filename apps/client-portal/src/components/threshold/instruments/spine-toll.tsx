'use client';

import type { ReactNode } from 'react';

import { formatCurrency, invoiceBalanceCents } from '@patina/shared';

import { legalDate } from '@/lib/threshold/dates';

import { parseSpineDate } from './making-spine';
import { ScoredAction } from './scored-action';


/* ── THE TOLL — an open balance sitting on the line ──────────────────────────
   A toll is not a gate: the spine does not break for it. Money owed is a thing
   to clear on the way past, so it reads as a ledger line folded inline — three
   mono figures in the accountant's order (total, paid, balance), the date it
   is due, and one act to settle it.

   Only the balance carries full ink. Total and paid are the arithmetic behind
   it and sit quiet, which is why the figure the client is actually being asked
   about is the one her eye lands on.

   Past due is stated, never shouted: the house rule is that money is never red
   on a client surface. An overdue toll reads in exactly the same ink as one
   due next week — the date does the telling. ─────────────────────────────── */

export interface SpineTollProps {
  /** The invoice this toll is. Also where the act leads. */
  invoiceId: string;
  /** The number on the paper. Null on invoices issued without one. */
  invoiceNumber: string | null;
  /** The whole of it, in cents. */
  totalCents: number;
  /** What has been settled so far, in cents. */
  paidCents: number;
  /** When it comes due. Null when the invoice carries no due date. */
  dueDate: string | null;
  /**
   * Today. Threaded by the letterbox, and kept for the callers that pass it;
   * the due date no longer reads it — a term of the invoice spells its year
   * every time.
   */
  today?: Date;
  /** Fired when the client takes the act — the caller reports `tollFollowed`. */
  onFollow?: () => void;
  /**
   * Settling IN PLACE — the only way the act is taken. There is no outbound
   * branch: the acts never leave the page (Kody 2026-09-04), and the invoice
   * route this once fell back to is retired.
   */
  settle: {
    onSettle: () => void;
    pending?: boolean;
    disabled?: boolean;
  };
  /** Laid in between the figures and the act — the way she would like to pay. */
  children?: ReactNode;
}

/** "15 September 2026". A term of the invoice, so the year is on the page —
 * the same rule the letterbox's summary line keeps. */
function formatDue(dueDate: string): string | null {
  const due = parseSpineDate(dueDate);
  return due ? legalDate(due) : null;
}

export function SpineToll({
  invoiceId,
  invoiceNumber,
  totalCents,
  paidCents,
  dueDate,
  onFollow,
  settle,
  children,
}: SpineTollProps) {
  // Derived, never passed in: the balance a client is asked to settle must be
  // the same arithmetic the ledger runs. `invoiceBalanceCents` floors at zero,
  // so an overpaid invoice reads as clear rather than as a negative toll.
  const balanceCents = invoiceBalanceCents({
    total_cents: totalCents,
    amount_paid_cents: paidCents,
  });

  // "A toll on the line · due 15 September 2026". `formatInvoiceDate`'s
  // abbreviated month-with-year is the invoice-list idiom, and it disagreed
  // with the very date column this row sits in.
  const due = dueDate ? formatDue(dueDate) : null;
  const dueLine = due ? `A toll on the line · due ${due}` : 'A toll on the line';

  return (
    <div
      data-testid="spine-toll"
      data-invoice-id={invoiceId}
      className="my-3 rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3.5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="type-meta text-[var(--text-primary)]">{invoiceNumber ?? 'Invoice'}</p>
        <p className="type-meta-small text-[var(--text-muted)]" data-testid="spine-toll-due">
          {dueLine}
        </p>
      </div>

      <dl className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2" data-testid="spine-toll-ledger">
        <Figure label="Total" cents={totalCents} />
        <Figure label="Paid" cents={paidCents} />
        <Figure label="Balance" cents={balanceCents} emphasis />
      </dl>

      {children}

      <div className="mt-3">
        {/* One act, taken here. `onFollow` reports the toll. */}
        <ScoredAction
          actionKey="toll_settle"
          regionKey="toll"
          variant="primary"
          loading={settle.pending}
          disabled={settle.disabled}
          onClick={() => {
            onFollow?.();
            settle.onSettle();
          }}
        >
          Settle the balance
        </ScoredAction>
      </div>
    </div>
  );
}

function Figure({
  label,
  cents,
  emphasis = false,
}: {
  label: string;
  cents: number;
  emphasis?: boolean;
}) {
  return (
    <div>
      <dt className="type-meta-small text-[var(--text-muted)]">{label}</dt>
      <dd
        className={
          emphasis
            ? 'mt-0.5 font-mono text-[0.95rem] text-[var(--text-primary)]'
            : 'mt-0.5 font-mono text-[0.8rem] text-[var(--text-muted)]'
        }
      >
        {formatCurrency(cents)}
      </dd>
    </div>
  );
}
