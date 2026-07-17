'use client';

import Link from 'next/link';
import {
  inspectionCountdown,
  EXCEPTION_TYPE_LABELS,
  type ExceptionListRow,
} from '@patina/fulfillment';

// The Exception Desk list (S7, spec §5.5) — clock-dominant rows, sorted by clock
// urgency server-side. The clock is the loudest element on each row (the thing
// with a deadline), type + order refs to its left. Resolved rows dim.

function RowClock({ clockDueAt }: { clockDueAt: string | null }) {
  const c = inspectionCountdown(clockDueAt, Date.now());
  if (!c) {
    return <span className="text-[0.7rem] text-[var(--text-subtle)]" style={{ fontFamily: 'var(--font-meta)' }}>—</span>;
  }
  const color = c.terracotta ? 'var(--color-terracotta, var(--color-error))' : 'var(--color-sage, var(--color-success))';
  return (
    <span
      className="tabular-nums leading-none"
      style={{ fontFamily: 'var(--font-meta)', color, fontSize: '1.15rem', fontWeight: 600 }}
      data-testid="exception-row-clock"
    >
      {c.label}
    </span>
  );
}

export function ExceptionsList({ rows }: { rows: ExceptionListRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="border p-6 text-center text-[0.9rem] italic text-[var(--text-muted)]" style={{ borderColor: 'var(--border-default)' }}>
        No exceptions — a quiet board.
      </div>
    );
  }
  return (
    <div className="flex flex-col" data-testid="exceptions-list">
      {rows.map((r) => {
        const refs = [r.orderNo != null ? `Order #${r.orderNo}` : null, r.clientName, r.itemName, r.poNumber]
          .filter(Boolean)
          .join(' · ');
        const dim = r.status === 'resolved';
        return (
          <Link
            key={r.id}
            href={`/fulfillment/exceptions/${r.id}`}
            data-testid="exception-row"
            data-status={r.status}
            className="flex items-center justify-between gap-4 border-b py-3 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ borderColor: 'var(--border-subtle)', opacity: dim ? 0.55 : 1 }}
          >
            <div className="min-w-0">
              <div className="text-[0.9rem] font-medium text-[var(--text-primary)]">
                {EXCEPTION_TYPE_LABELS[r.type] ?? r.type}
                {r.status === 'pending_leah' && (
                  <span className="ml-2 text-[0.65rem] uppercase tracking-[0.1em] text-[var(--accent-primary)]">with Leah</span>
                )}
                {r.status === 'resolved' && (
                  <span className="ml-2 text-[0.65rem] uppercase tracking-[0.1em] text-[var(--text-subtle)]">resolved</span>
                )}
              </div>
              <div className="truncate text-[0.8rem] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-meta)' }}>
                {refs || '—'}
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[0.5rem] uppercase tracking-[0.13em] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-meta)' }}>
                Clock
              </span>
              <RowClock clockDueAt={r.clockDueAt} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
