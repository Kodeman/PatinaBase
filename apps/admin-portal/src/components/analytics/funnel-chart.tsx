'use client';

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FunnelStepRow } from '@/app/api/admin/decision-analytics/route';

interface Props {
  rows: FunnelStepRow[];
}

const STEP_LABELS: Record<string, string> = {
  visitor: 'Visitor',
  waitlist: 'Waitlist',
  account_created: 'Account',
  first_action: 'First action',
  active_user: 'Active user',
};

export function FunnelChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="type-body-small italic text-[var(--text-muted)] py-8 text-center">
        No funnel data yet.
      </p>
    );
  }

  const data = rows.map((r) => ({
    ...r,
    label: STEP_LABELS[r.step] ?? r.step,
  }));

  return (
    <div className="h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 12, top: 24 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            tick={{ fontSize: 11, fill: '#8B7355' }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: '#8B7355' }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{ borderRadius: 4, borderColor: '#E5E2DD', fontSize: 12 }}
            formatter={(v: number, _: string, ctx: { payload?: FunnelStepRow }) => {
              const rate = ctx.payload?.conversionRatePercent;
              return rate !== null && rate !== undefined
                ? [`${v.toLocaleString()} (${rate.toFixed(1)}% from prev)`, 'Users']
                : [v.toLocaleString(), 'Users'];
            }}
          />
          <Bar dataKey="usersAtStep" fill="#8B9CAD" radius={2}>
            <LabelList
              dataKey="conversionRatePercent"
              position="top"
              formatter={(v: number | null) => (v !== null && v !== undefined ? `${v.toFixed(0)}%` : '')}
              style={{ fontSize: 11, fill: '#8B7355' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
