'use client';

import { MetricsRow, EmptyState } from '@/components/portal';
import { Skeleton } from '@/components/ui/skeleton';
import { useVitals } from '@/hooks/use-vitals';
import { VitalTile } from './vital-tile';

// WP-1.2 · Marketplace Vitals strip — four tiles above the inbox: liquidity
// ratio, GMV/designer, take-rate integrity, attach rate (placeholder).
// Number / label / trend arrow / threshold color only — no sparkline zoo.
// Data comes from get_marketplace_vitals() (00301), refreshed nightly; the
// route and this component carry no metric or band logic of their own.
export function VitalsStrip() {
  const { data: vitals, isLoading, isError, error } = useVitals();

  if (isLoading) {
    return (
      <MetricsRow columns={4}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </MetricsRow>
    );
  }

  if (isError) {
    return (
      <EmptyState
        label="Vitals unavailable"
        message={(error as Error)?.message ?? 'Failed to load marketplace vitals'}
      />
    );
  }

  if (!vitals || vitals.length === 0) {
    return <EmptyState label="Vitals" message="No marketplace vitals configured yet." />;
  }

  return (
    <MetricsRow columns={4}>
      {vitals.map((row) => (
        <VitalTile key={row.metric_key} row={row} />
      ))}
    </MetricsRow>
  );
}
