'use client';

import { cn } from '@/lib/utils';

interface BarChartProps {
  title: string;
  data: { label: string; value: number }[];
  className?: string;
  barColor?: string;
  hoverColor?: string;
  formatValue?: (value: number) => string;
}

export function BarChart({
  title,
  data,
  className,
  barColor = 'bg-patina-mocha-brown/20',
  hoverColor = 'hover:bg-patina-mocha-brown/40',
  formatValue,
}: BarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className={cn('bg-white rounded-xl border border-patina-clay-beige/20 p-6', className)}>
      <h2 className="font-display text-lg font-semibold text-patina-charcoal mb-6">{title}</h2>

      <div className="flex items-end gap-2 h-48">
        {data.map((item, i) => {
          const height = (item.value / maxValue) * 100;
          return (
            <div key={`${item.label}-${i}`} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex items-end justify-center h-40">
                <div
                  className={cn('w-full max-w-8 rounded-t-md transition-all', barColor, hoverColor)}
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={formatValue ? formatValue(item.value) : String(item.value)}
                />
              </div>
              <span className="text-xs text-patina-clay-beige truncate max-w-full">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
