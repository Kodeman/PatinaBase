'use client';

import { moneyInWords } from '@/components/making/standing-sentence';
import type { HouseLedgerModel } from '@/lib/threshold/derive';

/* ── The house ledger ───────────────────────────────────────────────────────
   Where the house stands in money, on the doorstep, in four lines.

   Every figure keeps its sentence. A number on its own is a dashboard tile,
   and a homeowner reading "$1,440" with no words is being handed a fact she
   has to decode; "Held on finished work · $1,440" is a fact she can read. So
   the row is the pair, and a row that has lost its words is not rendered.

   Nothing is ever reported as zero. A line with nothing to say says nothing —
   the same rule the standing sentence keeps — and a figure the surface does
   not yet know is silence, not "—". ─────────────────────────────────────── */

export interface HouseLedgerProps {
  ledger: HouseLedgerModel;
}

interface LedgerRow {
  key: 'owed' | 'held' | 'awaiting';
  words: string;
  cents: number | null;
}

function figure(cents: number | null | undefined): boolean {
  return typeof cents === 'number' && Number.isFinite(cents) && cents > 0;
}

export function HouseLedger({ ledger }: HouseLedgerProps) {
  const stands = figure(ledger.agreedCents) && figure(ledger.plannedCents);

  const rows: LedgerRow[] = [
    { key: 'owed', words: 'Owed on the open invoice', cents: ledger.owedCents },
    { key: 'held', words: 'Held on finished work', cents: ledger.heldCents },
    { key: 'awaiting', words: 'Awaiting your name', cents: ledger.awaitingCents },
  ].filter((row) => figure(row.cents)) as LedgerRow[];

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
          {`The house stands at ${moneyInWords(ledger.agreedCents as number)} agreed of ${moneyInWords(
            ledger.plannedCents as number,
          )} planned.`}
        </p>
      )}

      {rows.map((row) => (
        <div
          key={row.key}
          data-testid={`house-ledger-${row.key}`}
          className="flex justify-between gap-[14px] border-b border-[var(--border-subtle)] py-1.5 text-[15px] leading-[1.5] text-[var(--text-body)]"
        >
          <span data-ledger-words>{row.words}</span>
          <span
            data-ledger-figure
            className="font-mono text-[13.5px] tabular-nums text-[var(--text-primary)]"
          >
            {moneyInWords(row.cents as number)}
          </span>
        </div>
      ))}
    </div>
  );
}
