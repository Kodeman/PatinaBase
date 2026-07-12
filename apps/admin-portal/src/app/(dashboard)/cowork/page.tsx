'use client';

import { useMemo, useState } from 'react';
import { TaskQueueTable } from '@/components/pipeline/cowork/task-queue-table';
import { useCoworkTasks, useVendors } from '@/hooks/use-pipeline';
import {
  PageHeader,
  MetricBlock,
  MetricsRow,
  Section,
  FilterTabs,
  LoadingStrata,
} from '@/components/portal';

type Tab = 'all' | 'queued' | 'running' | 'awaiting_review' | 'done' | 'failed';

const TABS = [
  { value: 'all' as const, label: 'All' },
  { value: 'queued' as const, label: 'Queued' },
  { value: 'running' as const, label: 'Running' },
  { value: 'awaiting_review' as const, label: 'Awaiting Review' },
  { value: 'done' as const, label: 'Done' },
  { value: 'failed' as const, label: 'Failed' },
];

export default function CoworkPage() {
  const [tab, setTab] = useState<Tab>('all');

  const { data: tasks, isLoading } = useCoworkTasks({ limit: 200 });
  const { data: vendors } = useVendors();

  const vendorLookup = useMemo(() => {
    const map: Record<string, { slug: string; name: string }> = {};
    for (const v of vendors ?? []) map[v.id] = { slug: v.slug, name: v.name };
    return map;
  }, [vendors]);

  const metrics = useMemo(() => {
    const list = tasks ?? [];
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const last24 = list.filter((t) => new Date(t.created_at).getTime() >= oneDayAgo);
    return {
      running: list.filter((t) => ['queued', 'running'].includes(t.status)),
      scheduled: list.filter((t) => Boolean(t.payload?.recurrence)),
      completed24: last24.filter((t) => t.status === 'done').length,
      failed24: last24.filter((t) => t.status === 'failed').length,
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const list = tasks ?? [];
    if (tab === 'all') return list;
    return list.filter((t) => t.status === tab);
  }, [tasks, tab]);

  return (
    <div>
      <PageHeader
        title="Cowork"
        accent="tasks"
        description="Every task queued to Claude Cowork, including scheduled recurring jobs."
      />

      <MetricsRow columns={4}>
        <MetricBlock label="Running Now" value={metrics.running.length} trend="up" />
        <MetricBlock label="Scheduled (recurring)" value={metrics.scheduled.length} />
        <MetricBlock
          label="Completed (24h)"
          value={metrics.completed24}
          trend="up"
          change="last 24h"
        />
        <MetricBlock
          label="Failed (24h)"
          value={metrics.failed24}
          trend={metrics.failed24 > 0 ? 'down' : 'neutral'}
        />
      </MetricsRow>

      <div className="mt-10">
        <FilterTabs items={TABS} value={tab} onChange={setTab} />
      </div>

      <Section className="mt-6">
        {isLoading ? (
          <LoadingStrata />
        ) : (
          <TaskQueueTable tasks={filteredTasks} vendorLookup={vendorLookup} />
        )}
      </Section>
    </div>
  );
}
