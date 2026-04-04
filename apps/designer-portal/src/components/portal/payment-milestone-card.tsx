import type { PaymentMilestone } from '@/types/project-ui';

interface PaymentMilestoneCardProps {
  milestone: PaymentMilestone;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const statusColor: Record<PaymentMilestone['status'], string> = {
  paid: 'var(--color-sage)',
  outstanding: 'var(--color-terracotta)',
  pending: 'var(--text-muted)',
};

export function PaymentMilestoneCard({ milestone }: PaymentMilestoneCardProps) {
  return (
    <div
      className="border-b py-2.5"
      style={{ borderColor: 'rgba(229, 226, 221, 0.4)' }}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-body text-[0.88rem] font-medium text-[var(--text-primary)]">
          {milestone.title}
        </span>
        <span
          className="font-heading text-[0.95rem] font-semibold"
          style={{ color: statusColor[milestone.status] }}
        >
          {formatCurrency(milestone.amount)}
        </span>
      </div>
      <div
        className="mt-0.5 type-meta-small"
        style={{ color: statusColor[milestone.status] }}
      >
        {milestone.date ?? milestone.note ?? ''}
        {milestone.date && milestone.note ? ` · ${milestone.note}` : ''}
      </div>
    </div>
  );
}
