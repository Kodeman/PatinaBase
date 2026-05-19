'use client';

import type { ReactNode } from 'react';

interface MetricBlockProps {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  /**
   * Optional trailing node rendered after the label — typically a
   * `<InfoIcon surfaceKey={...} />` from `@patina/help-system` so an
   * operator can hover for the metric's source-of-truth definition.
   * Added in Sprint 3 F2 admin-portal help-system migration.
   */
  labelExtra?: ReactNode;
}

function formatValue(value: string | number): string {
  if (typeof value === 'number') {
    return value >= 1000 ? value.toLocaleString() : String(value);
  }
  // For strings, keep them as-is. Comma-formatting is only applied if the caller
  // passed a number; string inputs may contain prefixes/suffixes (e.g. "$1,234",
  // "12ms", "1/4") that must be preserved verbatim.
  return value;
}

export function MetricBlock({ label, value, change, trend, labelExtra }: MetricBlockProps) {
  const trendColor =
    trend === 'up'
      ? 'text-[var(--color-sage)]'
      : trend === 'down'
        ? 'text-[var(--color-terracotta)]'
        : 'text-[var(--text-muted)]';

  return (
    <div className="flex flex-col">
      <span className="type-meta mb-2 inline-flex items-center gap-1.5">
        {label}
        {labelExtra}
      </span>
      <span className="type-data-large mb-1">{formatValue(value)}</span>
      {change && <span className={`type-body-small ${trendColor}`}>{change}</span>}
    </div>
  );
}
