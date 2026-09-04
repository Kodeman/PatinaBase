'use client';

import { moneyInWords } from '@/components/making/standing-sentence';
import { parseSourceDate, type HouseLedgerModel } from '@/lib/threshold/derive';
import { owedDueLine } from '@/lib/threshold/standing';

/* ── The house ledger ───────────────────────────────────────────────────────
   Where the house stands in money, on the doorstep, in four lines.

   Every figure keeps its sentence. A number on its own is a dashboard tile,
   and a homeowner reading "$1,440" with no words is being handed a fact she
   has to decode; "Held on finished work · $1,440" is a fact she can read. So
   the row is the pair, and a row that has lost its words is not rendered.

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

interface LedgerRow {
  key: 'owed' | 'held' | 'awaiting';
  words: string;
  cents: number;
  /** What the figure carries after it, when the row has a day to name. */
  due?: string | null;
}

function figure(cents: number | null | undefined): cents is number {
  return typeof cents === 'number' && Number.isFinite(cents) && cents > 0;
}

/** One open invoice is "the open invoice"; several are counted in words. */
function owedWords(count: number): string {
  return count > 1 ? `Owed across ${count} open invoices` : 'Owed on the open invoice';
}

/**
 * Where the house stands, in one sentence. It is drawn whenever EITHER figure
 * is known, because this sentence is the column: beside the letterbox's
 * drawing a ledger of one row and no sentence reads as a half-empty page.
 */
function standsSentence(ledger: HouseLedgerModel): string | null {
  const agreed = figure(ledger.agreedCents) ? ledger.agreedCents : null;
  const planned = figure(ledger.plannedCents) ? ledger.plannedCents : null;
  if (agreed !== null && planned !== null) {
    return `The house stands at ${moneyInWords(agreed)} agreed of ${moneyInWords(
      planned,
    )} planned.`;
  }
  if (agreed !== null) return `The house stands at ${moneyInWords(agreed)} agreed.`;
  if (planned !== null) return `The house stands at ${moneyInWords(planned)} planned.`;
  return null;
}

export function HouseLedger({ ledger, today }: HouseLedgerProps) {
  const stands = standsSentence(ledger);

  const rows: LedgerRow[] = [
    {
      key: 'owed' as const,
      words: owedWords(ledger.owedInvoiceCount),
      cents: ledger.owedCents,
      due: owedDueLine(
        parseSourceDate(ledger.owedDueDate),
        ledger.owedDatedCount,
        today,
        ledger.owedInvoiceCount,
      ),
    },
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
      {stands && (
        <p
          data-testid="house-ledger-top"
          className="font-heading pb-[10px] text-[clamp(1.05rem,1.6vw,1.3rem)] leading-[1.35] tracking-[-0.01em] text-[var(--text-primary)]"
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
          <span
            data-ledger-figure
            className="font-mono text-[13.5px] tabular-nums text-[var(--text-primary)]"
          >
            {row.due ? `${moneyInWords(row.cents)} · ${row.due}` : moneyInWords(row.cents)}
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
