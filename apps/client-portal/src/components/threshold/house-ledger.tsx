'use client';

import { Fragment } from 'react';

import { formatCurrency } from '@patina/shared';

import { countInWords } from '@/components/threshold/instruments/standing-sentence';
import { parseSourceDate, type HouseLedgerModel } from '@/lib/threshold/derive';
import { owedDueLine } from '@/lib/threshold/standing';

/* ── The house ledger ───────────────────────────────────────────────────────
   Where the house stands in money, on the doorstep.

   THE OWED FIGURE IS THE ANNOUNCED FIGURE (PP-2 / R140). What she is on the
   hook for is set at the display step with the day it falls due beneath it,
   and one sentence under that reconciles the three figures — agreed, paid,
   owed — so the block adds up on its own line instead of leaving her to. The
   sentence that says where the house stands is true and stays, but it stands
   below the obligation, not above it.

   Every figure keeps its sentence. A number on its own is a dashboard tile,
   and a homeowner reading "$1,440" with no words is being handed a fact she
   has to decode; "Held on finished work · $1,440" is a fact she can read. So
   the row is the pair, and a row that has lost its words is not rendered.

   EVERY FIGURE CARRIES ITS CENTS (§F-B / PP-2). A ledger is arithmetic, and
   arithmetic that rounds does not add up on the page it is printed on: a
   client checking "$11,100 agreed · $0 paid · $4,060 owed" against her own
   invoice finds neither figure on it. `formatCurrency` is the one speller.

   Nothing is ever reported as zero. A line with nothing to say says nothing —
   the same rule the standing sentence keeps — and a figure the surface does
   not yet know is silence, not "—".

   The ROWS opt into dimming (`data-dimmable`), not the whole block: in the
   since-yesterday reading the sentence that says where the house stands is
   still the thing worth reading. ─────────────────────────────────────────── */

export interface HouseLedgerProps {
  ledger: HouseLedgerModel;
  /**
   * Today, for deciding whether the owed row's due date needs its year spelled
   * out — the same rule the letterbox and `SpineToll` keep. Omitted during SSR
   * and the first client paint, which simply drops the year.
   */
  today?: Date;
}

interface ReconcileClause {
  figure: string;
  words: string;
}

interface LedgerRow {
  key: 'held' | 'awaiting';
  words: string;
  cents: number;
}

function figure(cents: number | null | undefined): cents is number {
  return typeof cents === 'number' && Number.isFinite(cents) && cents > 0;
}

/**
 * One open invoice is "the open invoice"; several are counted in words.
 *
 * A letter drawn against no house stands in this house's letterbox by
 * adoption, not because the work is here. The envelope says so on its own
 * line, and the figure it is summed into may not quietly imply otherwise — a
 * homeowner reading "owed" against her house has to be able to tell which of
 * that money is her house's. P-24's rule holds across every arm: `countInWords`
 * is the surface's one speller, words to twelve, figures past it.
 */
function owedWords(count: number, studioCount: number, number: string | null): string {
  if (studioCount <= 0) {
    if (count > 1) return `Owed across ${countInWords(count)} open invoices`;
    return number ? `Owed on ${number}` : 'Owed on the open invoice';
  }
  if (studioCount >= count) {
    return count > 1
      ? `Owed across ${countInWords(count)} open invoices from the studio, not for this house`
      : 'Owed on the open invoice from the studio, not for this house';
  }
  return `Owed across ${countInWords(count)} open invoices, ${countInWords(studioCount)} from the studio`;
}

/**
 * Where the house stands, in one sentence. It is drawn whenever EITHER figure
 * is known, because this sentence is the column: beside the letterbox's
 * drawing a ledger of one row and no sentence reads as a half-empty page.
 */
/**
 * The one sentence the three figures reconcile in: "$11,100 agreed · $0 paid ·
 * $4,060 owed on INV-2026-0301." Every clause it can say truthfully, and no
 * clause it cannot — a house with nothing open owes nothing and says nothing.
 *
 * `owedWords` keeps its own S1 clause here: money owed on a letter drawn
 * against no house is still said to be from the studio and not for this house.
 */
function reconcileClauses(ledger: HouseLedgerModel): ReconcileClause[] | null {
  if (!figure(ledger.owedCents)) return null;
  const clauses: ReconcileClause[] = [];
  if (figure(ledger.agreedCents)) {
    clauses.push({ figure: formatCurrency(ledger.agreedCents), words: 'agreed' });
  }
  if (typeof ledger.paidCents === 'number' && Number.isFinite(ledger.paidCents)) {
    clauses.push({ figure: formatCurrency(ledger.paidCents), words: 'paid' });
  }
  const owed = owedWords(
    ledger.owedInvoiceCount,
    ledger.owedStudioCount,
    ledger.owedInvoiceNumber,
  );
  clauses.push({
    figure: formatCurrency(ledger.owedCents),
    words: `${owed.charAt(0).toLowerCase()}${owed.slice(1)}`,
  });
  return clauses;
}

function standsSentence(ledger: HouseLedgerModel): string | null {
  const agreed = figure(ledger.agreedCents) ? ledger.agreedCents : null;
  const planned = figure(ledger.plannedCents) ? ledger.plannedCents : null;
  if (agreed !== null && planned !== null) {
    return `The house stands at ${formatCurrency(agreed)} agreed of ${formatCurrency(
      planned,
    )} planned.`;
  }
  if (agreed !== null) return `The house stands at ${formatCurrency(agreed)} agreed.`;
  if (planned !== null) return `The house stands at ${formatCurrency(planned)} planned.`;
  return null;
}

export function HouseLedger({ ledger, today }: HouseLedgerProps) {
  const stands = standsSentence(ledger);
  const owed = figure(ledger.owedCents) ? ledger.owedCents : null;
  const owedDue = owedDueLine(
    parseSourceDate(ledger.owedDueDate),
    ledger.owedDatedCount,
    today,
    ledger.owedInvoiceCount,
  );
  const reconcile = reconcileClauses(ledger);

  const rows: LedgerRow[] = [
    { key: 'held' as const, words: 'Held on finished work', cents: ledger.heldCents },
    { key: 'awaiting' as const, words: 'Awaiting your name', cents: ledger.awaitingCents },
  ].flatMap((row) => (figure(row.cents) ? [{ ...row, cents: row.cents }] : []));

  return (
    <div
      id="ledger"
      data-threshold-unit="ledger"
      data-testid="house-ledger"
      className="border-t border-[var(--border-default)] pt-3"
    >
      {owed !== null && (
        <p data-testid="house-ledger-owed" className="t-d2 text-[var(--text-primary)]">
          {formatCurrency(owed)}
        </p>
      )}

      {owed !== null && owedDue && (
        <p data-testid="house-ledger-owed-due" className="t-meta pt-[10px] text-[var(--text-muted)]">
          {owedDue}
        </p>
      )}

      {reconcile && (
        <p
          data-testid="house-ledger-reconcile"
          className="t-body max-w-[56ch] pt-[10px] text-[var(--text-body)]"
        >
          {reconcile.map((clause, index) => (
            <Fragment key={clause.words}>
              {index > 0 ? ' · ' : ''}
              <span className="t-money">{clause.figure}</span>
              {` ${clause.words}`}
            </Fragment>
          ))}
          .
        </p>
      )}

      {stands && (
        <p
          data-testid="house-ledger-top"
          className="t-body-sm pt-[10px] pb-[10px] text-[var(--text-body)]"
        >
          {stands}
        </p>
      )}

      {rows.map((row) => (
        <div
          key={row.key}
          data-dimmable
          data-testid={`house-ledger-${row.key}`}
          className="flex justify-between gap-[14px] border-b border-[var(--border-subtle)] py-1.5 text-[15px] leading-[1.5] text-[var(--text-body)]"
        >
          <span data-ledger-words>{row.words}</span>
          <span data-ledger-figure className="t-money text-[var(--text-primary)]">
            {formatCurrency(row.cents)}
          </span>
        </div>
      ))}

      {ledger.overageLine && (
        <p
          data-dimmable
          data-testid="house-ledger-overage"
          className="pt-2.5 text-[15px] leading-[1.5] text-[var(--text-body)]"
        >
          {ledger.overageLine}
        </p>
      )}
    </div>
  );
}
