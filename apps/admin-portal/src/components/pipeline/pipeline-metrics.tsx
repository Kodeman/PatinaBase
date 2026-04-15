'use client';

import { Card, CardContent } from '@/components/ui/card';
import { usePipelineMetrics } from '@/hooks/use-pipeline';
import { Skeleton } from '@/components/ui/skeleton';

export function PipelineMetricsRow() {
  const { data, isLoading } = usePipelineMetrics();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const tiles = [
    { label: 'Green Light', value: data.by_triage.green, tone: 'text-patina-success' },
    { label: 'Yellow Light', value: data.by_triage.yellow, tone: 'text-patina-warning' },
    {
      label: 'Watch List',
      value: data.by_triage.orange + data.by_triage.red,
      tone: 'text-patina-error',
    },
    {
      label: 'In Onboarding',
      value: data.by_stage.onboarding,
      tone: 'text-patina-info',
    },
    {
      label: 'Live Partners',
      value: data.live_partners,
      tone: 'text-patina-success',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardContent className="pt-6">
            <div className={`font-display text-4xl font-bold tabular-nums ${t.tone}`}>
              {t.value}
            </div>
            <div className="mt-1 font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
              {t.label}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
