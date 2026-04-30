'use client';

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BottleneckPhaseRow } from '@/app/api/admin/decision-analytics/route';

interface Props {
  rows: BottleneckPhaseRow[];
}

export function BottleneckChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="type-body-small italic text-[var(--text-muted)] py-8 text-center">
        No decision data yet.
      </p>
    );
  }

  return (
    <div className="h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ left: 0, right: 12, top: 12 }}>
          <XAxis
            dataKey="linkedPhase"
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
            formatter={(v: number, name: string) => [v.toLocaleString(), name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="overdueCount" fill="#C8654E" radius={2} name="Overdue" stackId="a" />
          <Bar dataKey="pendingCount" fill="#C4A57B" radius={2} name="Pending" stackId="a" />
          <Bar
            dataKey="respondedCount"
            fill="#A8B5A0"
            radius={2}
            name="Responded"
            stackId="a"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
