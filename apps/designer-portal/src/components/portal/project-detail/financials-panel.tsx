import type { FinancialLineItem, PaymentMilestone, DesignerEarnings } from '@/types/project-ui';

interface FinancialsPanelProps {
  items: FinancialLineItem[];
  milestones: PaymentMilestone[];
  earnings?: DesignerEarnings;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function varianceColor(variance: number, isPlaceholder: boolean): string {
  if (isPlaceholder) return 'var(--text-muted)';
  if (variance < 0) return 'var(--color-sage)';
  if (variance > 0) return 'var(--color-terracotta)';
  return 'var(--color-sage)';
}

function varianceLabel(item: FinancialLineItem): string {
  if (item.committed === 0 && item.actual === 0) return 'Not yet';
  if (item.variance === 0) return 'On budget';
  if (item.label === 'Contingency (3%)' && item.actual === 0) return 'Untouched';
  return `${item.variance > 0 ? '+' : ''}${formatDollars(item.variance)}`;
}

const milestoneStatusColor: Record<PaymentMilestone['status'], string> = {
  paid: 'var(--color-sage)',
  outstanding: 'var(--color-terracotta)',
  pending: 'var(--text-muted)',
};

const milestoneStatusLabel: Record<PaymentMilestone['status'], string> = {
  paid: 'Paid',
  outstanding: 'Due · Outstanding',
  pending: 'At walkthrough',
};

export function FinancialsPanel({ items, milestones, earnings }: FinancialsPanelProps) {
  const totals = items.reduce(
    (acc, item) => ({
      budget: acc.budget + item.budget,
      committed: acc.committed + item.committed,
      actual: acc.actual + item.actual,
    }),
    { budget: 0, committed: 0, actual: 0 }
  );
  const totalVariance = totals.actual - totals.budget;

  return (
    <div>
      <h3
        style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 500,
          fontSize: '1.25rem',
          lineHeight: 1.35,
          marginBottom: '0.25rem',
        }}
      >
        Financials
      </h3>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        Budget vs. Committed vs. Actual · By room and category · Payment milestones
      </div>

      {/* Column headers */}
      <div
        className="mb-1 grid items-baseline gap-2 border-b py-1"
        style={{
          gridTemplateColumns: '1fr auto auto auto auto',
          borderColor: 'var(--border-default)',
        }}
      >
        {['Category', 'Budget', 'Committed', 'Actual', 'Variance'].map((h) => (
          <span
            key={h}
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.58rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
              textAlign: h === 'Category' ? 'left' : 'right',
              minWidth: h === 'Category' ? undefined : '55px',
            }}
          >
            {h}
          </span>
        ))}
      </div>

      {/* Line items */}
      {items.map((item) => {
        const isPlaceholder = item.committed === 0 && item.actual === 0;
        return (
          <div
            key={item.id}
            className="grid items-baseline gap-2 border-b py-1.5"
            style={{
              gridTemplateColumns: '1fr auto auto auto auto',
              borderColor: 'rgba(229, 226, 221, 0.4)',
            }}
          >
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 500 }}>{item.label}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.78rem', textAlign: 'right', minWidth: '55px', color: 'var(--text-muted)' }}>
              {formatDollars(item.budget)}
            </div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.78rem', textAlign: 'right', minWidth: '55px', color: isPlaceholder ? 'var(--text-muted)' : undefined }}>
              {isPlaceholder ? '—' : formatDollars(item.committed)}
            </div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.78rem', fontWeight: 600, textAlign: 'right', minWidth: '55px', color: isPlaceholder ? 'var(--text-muted)' : undefined }}>
              {isPlaceholder ? '—' : formatDollars(item.actual)}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-meta)',
                fontSize: '0.52rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                textAlign: 'right',
                minWidth: '55px',
                color: varianceColor(item.variance, isPlaceholder),
              }}
            >
              {varianceLabel(item)}
            </div>
          </div>
        );
      })}

      {/* Total row */}
      <div
        className="mt-1 grid items-baseline gap-2 border-t-2 pt-2"
        style={{
          gridTemplateColumns: '1fr auto auto auto auto',
          borderColor: 'var(--border-default)',
        }}
      >
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', fontWeight: 600 }}>Total</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', fontWeight: 700, textAlign: 'right', minWidth: '55px' }}>
          {formatDollars(totals.budget)}
        </div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', fontWeight: 700, textAlign: 'right', minWidth: '55px' }}>
          {formatDollars(totals.committed)}
        </div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', fontWeight: 700, textAlign: 'right', minWidth: '55px' }}>
          {formatDollars(totals.actual)}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.55rem',
            textAlign: 'right',
            minWidth: '55px',
            color: totalVariance <= 0 ? 'var(--color-sage)' : 'var(--color-terracotta)',
          }}
        >
          {totalVariance <= 0 ? `Under by ${formatDollars(Math.abs(totalVariance))}` : `Over by ${formatDollars(totalVariance)}`}
        </div>
      </div>

      {/* Payment milestones + Earnings */}
      <div className="mt-5 grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* Payments */}
        <div
          className="rounded-md border p-4"
          style={{ background: 'rgba(122, 155, 118, 0.03)', borderColor: 'rgba(122, 155, 118, 0.1)' }}
        >
          <div
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
              marginBottom: '0.4rem',
            }}
          >
            Payments
          </div>
          {milestones.map((m) => (
            <div
              key={m.id}
              className="grid items-baseline gap-3 py-1"
              style={{ gridTemplateColumns: '90px 1fr auto' }}
            >
              <div style={{ fontFamily: 'var(--font-meta)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', paddingTop: '0.12rem' }}>
                {m.title.split(' — ')[0]}
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-body)', lineHeight: 1.5 }}>
                {formatDollars(m.amount)} ({m.percentage}%)
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-meta)',
                  fontSize: '0.48rem',
                  textTransform: 'uppercase',
                  color: milestoneStatusColor[m.status],
                }}
              >
                {m.status === 'paid' ? m.date : milestoneStatusLabel[m.status]}
              </div>
            </div>
          ))}
        </div>

        {/* Earnings */}
        {earnings && (
          <div className="rounded-md border p-4" style={{ borderColor: 'var(--border-default)' }}>
            <div
              style={{
                fontFamily: 'var(--font-meta)',
                fontSize: '0.62rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                marginBottom: '0.4rem',
              }}
            >
              Designer Earnings
            </div>
            <div className="grid items-baseline gap-3 py-1" style={{ gridTemplateColumns: '100px 1fr' }}>
              <div style={{ fontFamily: 'var(--font-meta)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                Design Fee
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 500 }}>
                {formatDollars(earnings.designFee)}
              </div>
            </div>
            <div className="grid items-baseline gap-3 py-1" style={{ gridTemplateColumns: '100px 1fr' }}>
              <div style={{ fontFamily: 'var(--font-meta)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                Commissions
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 500 }}>
                {formatDollars(earnings.commissions)} est.
              </div>
            </div>
            <div className="grid items-baseline gap-3 py-1" style={{ gridTemplateColumns: '100px 1fr' }}>
              <div style={{ fontFamily: 'var(--font-meta)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                Total
              </div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', fontWeight: 600, color: 'var(--color-sage)' }}>
                {formatDollars(earnings.designFee + earnings.commissions)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
