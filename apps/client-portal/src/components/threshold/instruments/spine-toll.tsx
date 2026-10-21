'use client';

import type { ReactNode } from 'react';

import { formatCurrency, invoiceBalanceCents } from '@patina/shared';

import { legalDate } from '@/lib/threshold/dates';
import type { InvoiceDueState } from '@/lib/threshold/invoice-rollup';

import { ScoredAction } from './scored-action';

/* ── THE PAYMENT SHEET — one open balance, framed (US-45 CPUX-03, A3) ───────
   The balance due is the figure set largest, with the real due status under
   it in body ink, then the invoice total, then who the money is payable to.
   The way to pay and the consequence sentence are laid in by the caller, and
   the one act closes the card: the forest terminal, carrying the amount.

   Past due is stated, never shouted: money is never red on a client surface.
   An overdue balance reads in exactly the same ink as one due next week; the
   words do the telling. ────────────────────────────────────────────────── */

/**
 * "Past due · 25 September 2026", "Due today · 20 October 2026",
 * "Due 2 November 2026" or "No due date". The year is always on the page: a
 * due date is a term of the invoice. `dueState` comes from the invoice
 * projection; without it (before the page knows today) the date stands alone.
 */
export function dueStatus(
  dueDate: string | null | undefined,
  dueState?: InvoiceDueState | null,
): string {
  const date = legalDate(dueDate);
  if (!date) return 'No due date';
  if (dueState === 'past_due') return `Past due · ${date}`;
  if (dueState === 'due_today') return `Due today · ${date}`;
  return `Due ${date}`;
}

/** The due status, with what has been paid so far when anything has. */
export function dueLine(
  dueDate: string | null | undefined,
  dueState: InvoiceDueState | null | undefined,
  paidCents: number,
  currency: string,
): string {
  const status = dueStatus(dueDate, dueState);
  return paidCents > 0 ? `${status} · ${formatCurrency(paidCents, currency)} paid` : status;
}

export interface SpineTollAct {
  /** "Continue to secure payment · $309.00", or without a figure while none is confirmed. */
  label: string;
  onSettle: () => void;
  pending?: boolean;
  /** Why the act cannot be taken yet. Drawn under it, and the act stays focusable. */
  unavailableReason?: string;
}

export interface SpineTollProps {
  invoiceId: string;
  /** The number on the paper. Null on invoices issued without one. */
  invoiceNumber: string | null;
  totalCents: number;
  paidCents: number;
  dueDate: string | null;
  /** Where the due date stands against today, from the invoice projection. */
  dueState?: InvoiceDueState | null;
  /** The invoice's own currency. */
  currency?: string;
  /** The studio the money is payable to, resolved from this invoice's own row. */
  payee?: string | null;
  /** Fired when the act is taken; the caller reports it. */
  onFollow?: () => void;
  /** The act, or null where nothing may be paid here (a hold, or a check). */
  settle?: SpineTollAct | null;
  /** Laid in between the figures and the act: the way to pay, the consequence. */
  children?: ReactNode;
}

export function SpineToll({
  invoiceId,
  invoiceNumber,
  totalCents,
  paidCents,
  dueDate,
  dueState,
  currency = 'USD',
  payee,
  onFollow,
  settle,
  children,
}: SpineTollProps) {
  // Derived, never passed in: the balance asked for is the same arithmetic the
  // ledger runs, and it floors at zero, so an overpaid invoice reads as clear.
  const balanceCents = invoiceBalanceCents({
    total_cents: totalCents,
    amount_paid_cents: paidCents,
  });

  return (
    <div
      data-testid="spine-toll"
      data-invoice-id={invoiceId}
      className="cp-card flex min-w-0 flex-col gap-5 px-4 py-5 sm:px-6"
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-[15px] leading-[1.5] text-[var(--text-body)]">
          {invoiceNumber ?? 'Invoice'} · Balance due
        </p>
        <p
          data-testid="spine-toll-balance"
          className="font-mono text-[26px] leading-[1.2] tabular-nums text-[var(--text-primary)]"
        >
          {formatCurrency(balanceCents, currency)}
        </p>
        <p
          data-testid="spine-toll-due"
          className="max-w-[56ch] text-[16px] leading-[1.55] text-[var(--text-primary)]"
        >
          {dueLine(dueDate, dueState, paidCents, currency)}
        </p>
        <dl data-testid="spine-toll-ledger" className="m-0 flex flex-wrap gap-x-6 gap-y-1">
          <Figure label="Invoice total" value={formatCurrency(totalCents, currency)} />
          {payee && <Figure label="Payable to" value={payee} testId="spine-toll-payee" />}
        </dl>
      </div>

      {children}

      {settle && (
        <div>
          <ScoredAction
            actionKey="toll_settle"
            regionKey="toll"
            variant="terminal"
            loading={settle.pending}
            loadingLabel="Opening secure payment"
            unavailableReason={settle.unavailableReason}
            onClick={() => {
              onFollow?.();
              settle.onSettle();
            }}
          >
            {settle.label}
          </ScoredAction>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2" data-testid={testId}>
      <dt className="text-[15px] leading-[1.5] text-[var(--text-body)]">{label}</dt>
      <dd className="m-0 text-[16px] leading-[1.5] text-[var(--text-primary)] tabular-nums">
        {value}
      </dd>
    </div>
  );
}
