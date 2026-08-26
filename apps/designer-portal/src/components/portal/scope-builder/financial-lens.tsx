'use client';

/**
 * Financial lens (Track S² · S9) — the studio-owner money view over a schedule.
 * Per-row trade · markup% · client · line margin, grouped by room with room
 * subtotals and a document total (client total + total margin).
 *
 * DESIGNER-EYES ONLY. This analysis lives in the app, never in a file that
 * travels (the spec PDF renders client price at most). The parent gates
 * rendering to studio owners (useIsStudioOwner) — the panel itself assumes it is
 * only mounted for an owner. Shadow-free so it is safe in the Drafting Room too.
 */

import { useMemo } from 'react';
import { formatDollars, formatSignedDollars } from '@/lib/currency-ui';
import { lineMarginCents, lensTotals, type LineType } from '@/lib/scope/markup';

export interface LensRow {
  id: string;
  code: string | null;
  name: string;
  quantity: number;
  itemType: LineType;
  /** Unit trade price, cents. */
  tradeCents: number | null;
  markupPercent: number | null;
  /** Unit client price, cents. */
  clientUnitCents: number | null;
  /** Client line total, cents. */
  lineTotalCents: number | null;
  /** Group key; 'Unassigned' is allowed and sorts last. */
  roomName: string;
}

const MATH_HINT = 'trade × (1 + markup) = client';

function marginInput(row: LensRow) {
  return {
    item_type: row.itemType,
    line_total_cents: row.lineTotalCents,
    unit_price: row.tradeCents,
    quantity: row.quantity,
  };
}

function Money({ cents, signed }: { cents: number | null; signed?: boolean }) {
  if (cents === null || cents === undefined) {
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  }
  return <>{signed ? formatSignedDollars(cents) : formatDollars(cents)}</>;
}

export function FinancialLensPanel({ rows }: { rows: LensRow[] }) {
  // Preserve first-seen room order; 'Unassigned' always last.
  const groups = useMemo(() => {
    const order: string[] = [];
    const byRoom = new Map<string, LensRow[]>();
    for (const r of rows) {
      if (!byRoom.has(r.roomName)) {
        byRoom.set(r.roomName, []);
        order.push(r.roomName);
      }
      byRoom.get(r.roomName)!.push(r);
    }
    order.sort((a, b) => (a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : 0));
    return order.map((roomName) => ({ roomName, rows: byRoom.get(roomName)! }));
  }, [rows]);

  const docTotals = useMemo(() => lensTotals(rows.map(marginInput)), [rows]);

  if (rows.length === 0) return null;

  return (
    <div
      className="mb-4 overflow-x-auto rounded-md border-2"
      style={{ borderColor: 'var(--border-default)' }}
    >
      <div
        className="border-b px-3 py-2"
        style={{ borderColor: 'var(--border-default)', background: 'var(--bg-subtle, rgba(139,115,85,0.05))' }}
      >
        <span className="type-meta">Financial lens · studio only</span>
        <span
          className="ml-2"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', color: 'var(--text-muted)' }}
        >
          {MATH_HINT}
        </span>
      </div>

      <table className="w-full border-collapse" style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem' }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)' }}>
            <Th align="left">Code</Th>
            <Th align="left">Item</Th>
            <Th align="right">Qty</Th>
            <Th align="right">Trade</Th>
            <Th align="right">Markup</Th>
            <Th align="right">Client</Th>
            <Th align="right">Line margin</Th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const sub = lensTotals(group.rows.map(marginInput));
            return (
              <RoomBlock key={group.roomName} roomName={group.roomName} sub={sub}>
                {group.rows.map((row) => {
                  const margin = lineMarginCents(marginInput(row));
                  return (
                    <tr key={row.id} style={{ borderTop: '1px solid var(--border-default)' }}>
                      <Td align="left" mono>
                        {row.code || '—'}
                      </Td>
                      <Td align="left">{row.name}</Td>
                      <Td align="right">{row.itemType === 'tbd' ? '—' : row.quantity}</Td>
                      <Td align="right">
                        <Money cents={row.tradeCents} />
                      </Td>
                      <Td align="right">
                        {row.markupPercent === null || row.markupPercent === undefined
                          ? '—'
                          : `${Number(row.markupPercent)}%`}
                      </Td>
                      <Td align="right">
                        <Money cents={row.clientUnitCents} />
                      </Td>
                      <Td align="right" title={MATH_HINT}>
                        <Money cents={margin} signed />
                      </Td>
                    </tr>
                  );
                })}
              </RoomBlock>
            );
          })}
        </tbody>
        <tfoot>
          <tr
            style={{
              borderTop: '2px solid var(--text-primary)',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            <Td align="left" colSpan={5}>
              Document total
            </Td>
            <Td align="right">
              <Money cents={docTotals.clientTotalCents} />
            </Td>
            <Td align="right" title={docTotals.marginComplete ? MATH_HINT : 'Some lines have no trade price on file'}>
              {docTotals.marginComplete ? '' : '≥ '}
              <Money cents={docTotals.marginTotalCents} signed />
            </Td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function RoomBlock({
  roomName,
  sub,
  children,
}: {
  roomName: string;
  sub: { clientTotalCents: number; marginTotalCents: number; marginComplete: boolean };
  children: React.ReactNode;
}) {
  return (
    <>
      <tr style={{ background: 'rgba(139,115,85,0.04)' }}>
        <td
          colSpan={7}
          className="px-3 py-1 font-mono uppercase"
          style={{ fontSize: '0.58rem', letterSpacing: '0.06em', color: 'var(--color-clay-ink)' }}
        >
          {roomName}
        </td>
      </tr>
      {children}
      <tr style={{ borderTop: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>
        <Td align="right" colSpan={5}>
          {roomName} subtotal
        </Td>
        <Td align="right">{formatDollars(sub.clientTotalCents)}</Td>
        <Td align="right">
          {sub.marginComplete ? '' : '≥ '}
          {formatSignedDollars(sub.marginTotalCents)}
        </Td>
      </tr>
    </>
  );
}

function Th({ children, align }: { children: React.ReactNode; align: 'left' | 'right' }) {
  return (
    <th
      className="px-3 py-2 font-mono uppercase"
      style={{ fontSize: '0.55rem', letterSpacing: '0.05em', textAlign: align, fontWeight: 500 }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  mono,
  colSpan,
  title,
}: {
  children: React.ReactNode;
  align: 'left' | 'right';
  mono?: boolean;
  colSpan?: number;
  title?: string;
}) {
  return (
    <td
      className={`px-3 py-1.5 ${mono ? 'font-mono uppercase' : ''}`}
      style={{ textAlign: align }}
      colSpan={colSpan}
      title={title}
    >
      {children}
    </td>
  );
}
