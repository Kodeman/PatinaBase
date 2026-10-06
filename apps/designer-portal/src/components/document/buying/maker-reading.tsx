'use client';

/**
 * Read by maker (US-16 C-15, D1-01): the Project section's lines grouped by
 * who the studio buys from — maker → its purchase orders → the lines not yet
 * on one, then "No maker yet". The money column is what the maker charges.
 * Client price and markup show only when the studio lets this viewer see its
 * margin (C-36); a negative markup prints plainly (R5).
 *
 * The grouping is `readByMaker` (lib/document/buying-readings.ts); this file
 * only prints it.
 */

import { Fragment, useMemo, type ReactNode } from 'react';
import { useCanSeeStudioMargin, useProjectV2 } from '@patina/supabase';
import { formatMoney } from '@/lib/currency-totals';
import {
  formatMarkup,
  readByMaker,
  type BuyingLine,
  type BuyingReading,
  type MakerLine,
} from '@/lib/document/buying-readings';

const HEAD = 'font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]';

const READINGS: { key: BuyingReading; label: string }[] = [
  { key: 'room', label: 'room' },
  { key: 'maker', label: 'maker' },
];

/**
 * "read by · room · maker" — the Ledger's quiet lens grammar (orders-ledger
 * LensLink): DM-mono words, the worn one scored and pressed.
 */
export function ReadingLens({
  reading,
  onChange,
  lockedReason = null,
}: {
  reading: BuyingReading;
  onChange: (next: BuyingReading) => void;
  /** While ticks are in hand the reading cannot change; this says why. */
  lockedReason?: string | null;
}) {
  const reasonId = 'ffe-reading-locked-reason';
  return (
    <div
      role="group"
      aria-label="Read the pieces by"
      className="mb-2 flex flex-wrap items-baseline justify-end gap-x-1.5"
      data-ffe-reading={reading}
    >
      <span className={HEAD}>read by</span>
      {READINGS.map(({ key, label }) => {
        const active = reading === key;
        return (
          <Fragment key={key}>
            <span aria-hidden className={HEAD}>
              ·
            </span>
            <button
              type="button"
              aria-pressed={active}
              aria-label={`Read by ${label}`}
              aria-disabled={lockedReason ? true : undefined}
              aria-describedby={lockedReason ? reasonId : undefined}
              onClick={() => {
                if (!lockedReason && !active) onChange(key);
              }}
              className={`da-score-hover inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.08em] transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)] ${
                active
                  ? 'da-score-on text-[var(--color-charcoal)]'
                  : 'text-[var(--color-quiet-ink)] hover:text-[var(--color-charcoal)]'
              } ${lockedReason ? 'cursor-default opacity-60' : ''}`}
            >
              {label}
            </button>
          </Fragment>
        );
      })}
      {lockedReason && (
        <span id={reasonId} className="text-[11px] text-[var(--text-muted)]">
          {lockedReason}
        </span>
      )}
    </div>
  );
}

/** The row shape the section hands over: its own line row, item first. */
export interface MakerReadingRow {
  item: BuyingLine & { name: string; room?: { name?: string | null } | null };
}

/**
 * The connected reading. Who may see margin is the studio's rule, asked of
 * the project's studio; until it answers (or with no studio behind the
 * project) the margin columns stay away.
 */
export function MakerReading<T extends MakerReadingRow>({
  projectId,
  rows,
  wordFor,
  openLineId,
  onToggleLine,
  renderUnfold,
}: {
  projectId: string;
  rows: readonly T[];
  wordFor: (row: T) => string;
  openLineId: string | null;
  onToggleLine: (lineId: string) => void;
  renderUnfold: (row: T) => ReactNode;
}) {
  const { data: project } = useProjectV2(projectId) as {
    data: { studio_id?: string | null } | null | undefined;
  };
  const { data: canSeeMargin } = useCanSeeStudioMargin(project?.studio_id ?? null);
  return (
    <MakerReadingTable
      rows={rows}
      canSeeMargin={canSeeMargin === true}
      wordFor={wordFor}
      openLineId={openLineId}
      onToggleLine={onToggleLine}
      renderUnfold={renderUnfold}
    />
  );
}

export function MakerReadingTable<T extends MakerReadingRow>({
  rows,
  canSeeMargin,
  wordFor,
  openLineId,
  onToggleLine,
  renderUnfold,
}: {
  rows: readonly T[];
  canSeeMargin: boolean;
  wordFor: (row: T) => string;
  openLineId: string | null;
  onToggleLine: (lineId: string) => void;
  renderUnfold: (row: T) => ReactNode;
}) {
  const reading = useMemo(
    () => readByMaker(rows, (row) => row.item, { canSeeMargin }),
    [rows, canSeeMargin],
  );
  const columns = canSeeMargin ? 6 : 4;

  const lineRow = (line: MakerLine<T>) => {
    const { item } = line.row;
    const open = openLineId === line.id;
    return (
      <Fragment key={line.id}>
        <tr
          id={`ffe-selection-${line.id}`}
          className="scroll-mt-24 border-b border-[var(--color-pearl)] align-baseline"
        >
          <td className="py-2 pl-2 pr-3">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => onToggleLine(line.id)}
              className="text-left text-[12.5px] font-medium leading-snug text-[var(--color-charcoal)] hover:underline"
            >
              {item.name}
            </button>
            {item.room?.name && (
              <span className="block text-[11px] text-[var(--text-muted)]">
                {item.room.name}
              </span>
            )}
          </td>
          <td className="px-3 py-2 text-right text-[12.5px] tabular-nums">{line.quantity}</td>
          <td className="px-3 py-2 text-right font-heading text-[13px] font-medium tabular-nums text-[var(--color-charcoal)]">
            {line.tradeCents == null ? '—' : formatMoney(line.tradeCents, line.currency)}
          </td>
          {canSeeMargin && (
            <>
              <td className="px-3 py-2 text-right text-[12.5px] tabular-nums">
                {line.clientCents == null ? '—' : formatMoney(line.clientCents, line.currency)}
              </td>
              <td
                className="px-3 py-2 text-right text-[12.5px] tabular-nums"
                data-negative-markup={line.markupPct != null && line.markupPct < 0 ? '' : undefined}
              >
                {line.markupPct == null ? '—' : formatMarkup(line.markupPct)}
              </td>
            </>
          )}
          <td className="py-2 pl-3 pr-2 text-[12px] text-[var(--text-muted)]">{wordFor(line.row)}</td>
        </tr>
        {open && (
          <tr>
            <td colSpan={columns} className="px-2">
              {renderUnfold(line.row)}
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  const foot = (key: string, text: string) => (
    <tr key={key}>
      <td colSpan={columns} className="pb-3 pl-2 pt-1.5 text-[11.5px] text-[var(--text-muted)]">
        {text}
      </td>
    </tr>
  );

  return (
    <div data-ffe-reading-body="maker">
      <p className="mb-3 text-[12.5px] text-[var(--color-charcoal)]" data-buying-front-matter>
        {reading.frontMatter}
      </p>
      <table className="w-full border-collapse">
        <caption className="sr-only">The pieces, read by maker</caption>
        <thead>
          <tr className="border-b border-[var(--color-charcoal)]">
            <th scope="col" className={`${HEAD} pb-1.5 pl-2 text-left font-normal`}>Line</th>
            <th scope="col" className={`${HEAD} px-3 pb-1.5 text-right font-normal`}>Qty</th>
            <th scope="col" className={`${HEAD} px-3 pb-1.5 text-right font-normal`}>Trade cost</th>
            {canSeeMargin && (
              <>
                <th scope="col" className={`${HEAD} px-3 pb-1.5 text-right font-normal`}>Client price</th>
                <th scope="col" className={`${HEAD} px-3 pb-1.5 text-right font-normal`}>Markup</th>
              </>
            )}
            <th scope="col" className={`${HEAD} pb-1.5 pl-3 text-left font-normal`}>State</th>
          </tr>
        </thead>
        {reading.groups.map((group) => (
          <tbody key={group.key} data-maker-group={group.key}>
            <tr>
              <th
                scope="rowgroup"
                colSpan={columns}
                className={`${HEAD} pb-1 pl-2 pt-4 text-left font-normal text-[var(--color-charcoal)]`}
              >
                {group.maker ?? `No maker yet · ${group.lineCount}`}
              </th>
            </tr>
            {/* One flat keyed list, so ordering a line (it moves from "not
                yet ordered" onto its new PO) keeps its row and open unfold
                mounted — the Order Assistant lives in LineUnfold's state. */}
            {[
              ...group.orders.flatMap((order) => [
                ...order.lines.map(lineRow),
                foot(`foot:${order.key}`, order.foot),
              ]),
              ...group.notOnOrder.map(lineRow),
              ...(group.maker !== null && group.notOnOrder.length > 0
                ? [foot('foot:not-on-order', 'Not yet ordered')]
                : []),
            ]}
          </tbody>
        ))}
      </table>
    </div>
  );
}
