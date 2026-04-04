import type { BudgetLineItem } from '@/types/project-ui';

interface BudgetTableProps {
  items: BudgetLineItem[];
  showHeader?: boolean;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getActualColor(budgeted: number, actual: number): string {
  if (actual === 0) return 'var(--text-muted)';
  if (actual < budgeted) return 'var(--color-sage)';
  if (actual > budgeted) return 'var(--color-terracotta)';
  return 'var(--text-primary)';
}

export function BudgetTable({ items, showHeader = false }: BudgetTableProps) {
  const totalBudgeted = items.reduce((sum, item) => sum + item.budgeted, 0);
  const totalActual = items.reduce((sum, item) => sum + item.actual, 0);

  return (
    <div>
      {showHeader && (
        <div
          className="grid gap-6 border-b border-[var(--border-default)] py-1.5"
          style={{ gridTemplateColumns: '1fr auto auto' }}
        >
          <span className="type-meta-small">Category</span>
          <span className="type-meta-small text-right">Budget</span>
          <span className="type-meta-small text-right">Actual</span>
        </div>
      )}

      {items.map((item) => (
        <div
          key={item.id}
          className="grid items-baseline gap-6 border-b py-2"
          style={{
            gridTemplateColumns: '1fr auto auto',
            borderColor: 'rgba(229, 226, 221, 0.4)',
          }}
        >
          <span className="font-body text-[0.88rem] text-[var(--text-primary)]">
            {item.label}
          </span>
          <span className="type-meta text-[var(--text-muted)]" style={{ textAlign: 'right' }}>
            {formatCurrency(item.budgeted)}
          </span>
          <span
            className="text-right font-heading text-[0.95rem] font-semibold"
            style={{ color: getActualColor(item.budgeted, item.actual) }}
          >
            {item.actual > 0 ? formatCurrency(item.actual) : '—'}
          </span>
        </div>
      ))}

      {/* Total row */}
      <div
        className="mt-1 grid items-baseline gap-6 border-t-2 border-[var(--border-default)] pt-3"
        style={{ gridTemplateColumns: '1fr auto auto' }}
      >
        <span className="font-body text-[0.88rem] font-semibold text-[var(--text-primary)]">
          Total
        </span>
        <span className="type-meta text-[var(--text-muted)]" style={{ textAlign: 'right' }}>
          {formatCurrency(totalBudgeted)}
        </span>
        <span
          className="text-right font-heading text-[1.2rem] font-semibold"
          style={{ color: getActualColor(totalBudgeted, totalActual) }}
        >
          {formatCurrency(totalActual)}
        </span>
      </div>
    </div>
  );
}
