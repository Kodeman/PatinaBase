'use client';

import { cn } from '@/lib/utils';
import type { FunnelStep } from '@patina/supabase';

interface FunnelChartProps {
  title: string;
  steps: FunnelStep[];
  className?: string;
}

const stepColors = [
  'bg-patina-mocha-brown',
  'bg-patina-mocha-brown/80',
  'bg-patina-mocha-brown/60',
  'bg-patina-clay-beige/80',
  'bg-patina-clay-beige/60',
  'bg-patina-clay-beige/40',
];

export function FunnelChart({ title, steps, className }: FunnelChartProps) {
  if (steps.length === 0) {
    return (
      <div className={cn('bg-white rounded-xl border border-patina-clay-beige/20 p-6', className)}>
        <h2 className="font-display text-lg font-semibold text-patina-charcoal mb-4">{title}</h2>
        <p className="text-sm text-patina-clay-beige">No funnel data available yet.</p>
      </div>
    );
  }

  const maxCount = steps[0]?.count || 1;

  return (
    <div className={cn('bg-white rounded-xl border border-patina-clay-beige/20 p-6', className)}>
      <h2 className="font-display text-lg font-semibold text-patina-charcoal mb-4">{title}</h2>

      <div className="space-y-3">
        {steps.map((step, i) => {
          const widthPercent = (step.count / maxCount) * 100;
          const colorClass = stepColors[i] || stepColors[stepColors.length - 1];

          return (
            <div key={step.step}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-patina-charcoal font-medium">{step.step}</span>
                <span className="text-xs text-patina-clay-beige">
                  {step.conversionRate > 0 ? `${step.conversionRate.toFixed(1)}%` : ''}
                </span>
              </div>
              <div className="relative h-8 bg-patina-off-white rounded">
                <div
                  className={cn('h-full rounded transition-all', colorClass)}
                  style={{ width: `${Math.max(widthPercent, 2)}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-patina-charcoal/70">
                  {step.count.toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
