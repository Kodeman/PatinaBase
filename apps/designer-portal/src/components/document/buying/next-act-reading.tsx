'use client';

/**
 * Read by next act (US-16 C-33, D1-01 S2): the Project section's lines grouped
 * by what each is waiting on — the first reason its order is refused, "Ready
 * to order", or the step an ordered line has reached. A group with no lines
 * prints nothing; the count sits in the running head as text.
 *
 * The grouping is `readByNextAct` (lib/document/buying-readings.ts); this file
 * only prints it.
 */

import { Fragment, useMemo, type ReactNode } from 'react';
import { readByNextAct, type NextActLine } from '@/lib/document/buying-readings';

const HEAD = 'font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]';
const COLUMNS = 4;

export interface NextActReadingRow {
  item: NextActLine & { name: string; room?: { name?: string | null } | null };
}

export function NextActReading<T extends NextActReadingRow>({
  rows,
  reasonsFor,
  wordFor,
  openLineId,
  onToggleLine,
  renderUnfold,
}: {
  rows: readonly T[];
  /** `deriveOrderReadiness(...).reasons` for the line. */
  reasonsFor: (row: T) => readonly string[];
  wordFor: (row: T) => string;
  openLineId: string | null;
  onToggleLine: (lineId: string) => void;
  renderUnfold: (row: T) => ReactNode;
}) {
  const reading = useMemo(
    () => readByNextAct(rows, (row) => row.item, reasonsFor),
    [rows, reasonsFor],
  );

  const lineRow = (row: T, headId: string) => {
    const { item } = row;
    const id = String(item.id);
    const open = openLineId === id;
    return (
      <Fragment key={id}>
        <tr
          id={`ffe-selection-${id}`}
          className="scroll-mt-24 border-b border-[var(--color-pearl)] align-baseline"
        >
          <td headers={headId} className="py-2 pl-2 pr-3">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => onToggleLine(id)}
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
          <td className="px-3 py-2 text-right text-[12.5px] tabular-nums">{item.quantity ?? 1}</td>
          <td className="px-3 py-2 text-[12px] text-[var(--text-muted)]">
            {item.vendor_name ?? item.product?.brand ?? '—'}
          </td>
          <td className="py-2 pl-3 pr-2 text-[12px] text-[var(--text-muted)]">{wordFor(row)}</td>
        </tr>
        {open && (
          <tr>
            <td colSpan={COLUMNS} className="px-2">
              {renderUnfold(row)}
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div data-ffe-reading-body="next">
      <table className="w-full border-collapse">
        <caption className="sr-only">The pieces, read by next act</caption>
        <thead>
          <tr className="border-b border-[var(--color-charcoal)]">
            <th scope="col" className={`${HEAD} pb-1.5 pl-2 text-left font-normal`}>Line</th>
            <th scope="col" className={`${HEAD} px-3 pb-1.5 text-right font-normal`}>Qty</th>
            <th scope="col" className={`${HEAD} px-3 pb-1.5 text-left font-normal`}>Maker</th>
            <th scope="col" className={`${HEAD} pb-1.5 pl-3 text-left font-normal`}>State</th>
          </tr>
        </thead>
        {/* One body, one flat keyed list: a line that advances (ordered, sent,
            acknowledged) moves to another group without remounting its row
            or its open unfold — the Order Assistant lives in LineUnfold's
            state. */}
        <tbody>
          {reading.groups.flatMap((group, index) => {
            const headId = `ffe-next-act-${index}`;
            return [
              <tr key={`head:${group.key}`} data-next-act-group={group.key}>
                <th
                  id={headId}
                  colSpan={COLUMNS}
                  className={`${HEAD} pb-1 pl-2 pt-4 text-left font-normal text-[var(--color-charcoal)]`}
                >
                  {`${group.label} · ${group.rows.length}`}
                </th>
              </tr>,
              ...group.rows.map((row) => lineRow(row, headId)),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
