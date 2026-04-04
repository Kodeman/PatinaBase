'use client';

import { DetailRow } from './detail-row';

interface PaymentMilestone {
  label: string;
  percent: number;
  description: string;
}

interface PaymentScheduleProps {
  milestones: PaymentMilestone[];
  totalAmount: number; // cents
}

export function PaymentSchedule({ milestones, totalAmount }: PaymentScheduleProps) {
  return (
    <div>
      <div
        className="mb-2"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.62rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
        }}
      >
        Payment Schedule
      </div>
      {milestones.map((milestone, i) => {
        const amount = Math.round((totalAmount * milestone.percent) / 100);
        return (
          <DetailRow
            key={i}
            label={milestone.label}
            value={`$${(amount / 100).toLocaleString()} (${milestone.percent}%) \u2014 ${milestone.description}`}
          />
        );
      })}
    </div>
  );
}
