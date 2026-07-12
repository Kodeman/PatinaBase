'use client';

import { useState } from 'react';
import { PageHeader, LoadingStrata, EmptyState, FilterTabs, type FilterTab } from '@/components/portal';
import { MissionControlTabs } from '@/components/mission-control/mission-control-tabs';
import { RunLogTable } from '@/components/mission-control/run-log-table';
import { useAgentRuns } from '@/hooks/use-agent-tasks';
import type { RunView } from '@/lib/run-rows';

// WP-1.4 · Run Log / Agent Health — Mission Control's anti-silent-failure surface.
// UNIONs job_runs + run-relevant agent_tasks into one table; a run that errored
// is visible here within one grooming cycle. View tabs filter jobs / agents /
// failed / stale.

const VIEW_TABS: FilterTab<RunView>[] = [
  { value: 'all', label: 'All' },
  { value: 'jobs', label: 'Jobs' },
  { value: 'agents', label: 'Agents' },
  { value: 'failed', label: 'Failed' },
  { value: 'stale', label: 'Stale' },
];

export default function RunsPage() {
  const [view, setView] = useState<RunView>('all');
  const { data: rows, isLoading, isError, error } = useAgentRuns(view);

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Run"
        accent="Log"
        description="Every job and agent run, unified. A run that errors surfaces here within one grooming cycle — expand a failure to read it in full."
      />
      <MissionControlTabs />
      <FilterTabs items={VIEW_TABS} value={view} onChange={setView} className="mt-1" />

      {isLoading ? (
        <LoadingStrata />
      ) : isError ? (
        <EmptyState label="Error" message={(error as Error)?.message ?? 'Failed to load runs'} />
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          label="No runs"
          message="No runs match this view yet. Scheduled jobs and agent tasks will appear here as they run."
        />
      ) : (
        <RunLogTable rows={rows} />
      )}
    </div>
  );
}
