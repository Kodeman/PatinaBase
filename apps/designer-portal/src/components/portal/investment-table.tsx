'use client';

interface InvestmentRow {
  label: string;
  amount: number; // cents
  isSubItem?: boolean;
}

interface InvestmentTableProps {
  rows: InvestmentRow[];
  totalLabel?: string;
  totalAmount: number; // cents
}

export function InvestmentTable({
  rows,
  totalLabel = 'Total Investment',
  totalAmount,
}: InvestmentTableProps) {
  return (
    <div>
      {rows.map((row, i) => (
        <div
          key={i}
          className="grid items-baseline gap-6 border-b border-[rgba(229,226,221,0.4)] py-2"
          style={{ gridTemplateColumns: '1fr auto' }}
        >
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: row.isSubItem ? '0.82rem' : '0.88rem',
              color: row.isSubItem ? 'var(--text-body)' : 'var(--text-primary)',
              paddingLeft: row.isSubItem ? '1rem' : 0,
            }}
          >
            {row.label}
          </div>
          {row.amount > 0 && (
            <div
              className="text-right"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: row.isSubItem ? '0.82rem' : '0.95rem',
                color: row.isSubItem ? 'var(--text-muted)' : 'var(--text-primary)',
              }}
            >
              ${(row.amount / 100).toLocaleString()}
            </div>
          )}
        </div>
      ))}

      {/* Total row */}
      <div
        className="mt-1 grid items-baseline gap-6 border-t-2 border-[var(--border-subtle)] pt-3"
        style={{ gridTemplateColumns: '1fr auto' }}
      >
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.88rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {totalLabel}
        </div>
        <div
          className="text-right"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: '1.3rem',
            color: 'var(--text-primary)',
          }}
        >
          ${(totalAmount / 100).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
