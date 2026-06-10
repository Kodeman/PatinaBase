'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { normalizePhaseSlug } from '@patina/types';
import { formatCurrency } from '@patina/shared';
import { useProject } from '@/hooks/use-projects';
import {
  useTimeEntries,
  useUnbilledTime,
  useTimeSummary,
  useDeleteTimeEntry,
} from '@/hooks/use-time-tracking';
import { PageActionBar } from '@/components/portal/page-action-bar';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { MetricBlock } from '@/components/portal/metric-block';
import { useToast } from '@/components/portal/toast-provider';
import { Button } from '@/components/ui/controls';
import { LogTimeDialog } from '@/components/portal/time/log-time-dialog';
import { TimeEntriesTable, type TimeEntryRow } from '@/components/portal/time/time-entries-table';
import { formatHoursLabel } from '@/lib/time-billing';
import { useHydrated } from '@/hooks/use-hydrated';

/**
 * Project time ledger (00177): every completed entry week-by-week, the
 * unbilled balance, and the jump-off into billing (composer pre-scoped to
 * this project). The summary panel on the project overview links here.
 */
export default function ProjectTimePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const hydrated = useHydrated();
  const { toast } = useToast();

  // useProject returns untyped mock-fallback data (same cast as the financials page).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project, isLoading } = useProject(id) as { data: any; isLoading: boolean };
  const { data: entries, isLoading: entriesLoading } = useTimeEntries(id);
  const { data: unbilled } = useUnbilledTime(id);
  const { data: summary } = useTimeSummary(id);
  const deleteEntry = useDeleteTimeEntry();

  const [showLogTime, setShowLogTime] = useState(false);

  // Merge the unbilled view's resolved amounts onto the raw entries so the
  // table can price unbilled rows (invoiced rows keep their snapshot on the
  // invoice — no amount column value here).
  const rows = useMemo<TimeEntryRow[]>(() => {
    const amountById = new Map(
      (unbilled?.entries ?? []).map((e) => [e.id, e.amount_cents] as const)
    );
    return (entries ?? []).map((entry) => ({
      ...entry,
      amount_cents: amountById.get(entry.id) ?? null,
    }));
  }, [entries, unbilled]);

  const billableMinutes = useMemo(
    () => (entries ?? []).reduce((sum, e) => sum + (e.billable ? e.duration_minutes || 0 : 0), 0),
    [entries]
  );
  const totalMinutes = useMemo(
    () => (entries ?? []).reduce((sum, e) => sum + (e.duration_minutes || 0), 0),
    [entries]
  );

  if (!hydrated || isLoading || entriesLoading) return <LoadingStrata />;
  if (!project) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">Project not found.</p>
    );
  }

  const hasUnbilled = (unbilled?.entries.length ?? 0) > 0;

  const handleDelete = async (entry: TimeEntryRow) => {
    if (!window.confirm('Delete this time entry? This cannot be undone.')) return;
    try {
      await deleteEntry.mutateAsync({ id: entry.id, projectId: id });
      toast('Time entry deleted', 'info');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not delete the entry', 'error');
    }
  };

  return (
    <div className="pt-8">
      <LogTimeDialog
        open={showLogTime}
        projectId={id}
        defaultPhase={
          project.current_phase ? normalizePhaseSlug(project.current_phase) : undefined
        }
        onClose={() => setShowLogTime(false)}
        onLogged={() => toast('Time logged', 'success')}
      />

      <PageActionBar
        meta={
          <div className="min-w-0">
            <span className="type-label-secondary">Time</span>
            <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
              Hours logged on this project. Time is internal — clients only see what you bill.
            </p>
          </div>
        }
        actions={
          <>
            {hasUnbilled && (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/portal/billing/invoices/new?projectId=${id}`}>
                  Bill unbilled time
                </Link>
              </Button>
            )}
            <Button type="button" variant="primary" size="sm" onClick={() => setShowLogTime(true)}>
              Log time
            </Button>
          </>
        }
      />

      {/* Rollups */}
      <div
        className="mb-8 flex flex-wrap gap-0 border-b pb-6"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <div className="pr-8">
          <MetricBlock
            label="Logged"
            value={formatHoursLabel(totalMinutes)}
            change={
              summary && summary.totalEstimated > 0
                ? `of ${summary.totalEstimated}h estimated`
                : undefined
            }
            trend="neutral"
          />
        </div>
        <div className="border-l px-8" style={{ borderColor: 'var(--border-default)' }}>
          <MetricBlock label="Billable" value={formatHoursLabel(billableMinutes)} />
        </div>
        <div className="border-l px-8" style={{ borderColor: 'var(--border-default)' }}>
          <MetricBlock
            label="Unbilled"
            value={formatHoursLabel(unbilled?.totalMinutes ?? 0)}
            change={`${unbilled?.entries.length ?? 0} entries`}
            trend="neutral"
          />
        </div>
        <div className="border-l pl-8" style={{ borderColor: 'var(--border-default)' }}>
          <MetricBlock
            label="Unbilled Value"
            value={formatCurrency(unbilled?.totalAmountCents ?? 0)}
          />
        </div>
      </div>

      {/* Ledger */}
      <TimeEntriesTable
        entries={rows}
        onDelete={handleDelete}
        deletePendingId={deleteEntry.isPending ? (deleteEntry.variables?.id ?? null) : null}
        emptyLabel="No time logged yet — use “Log time” to record your first entry."
      />
    </div>
  );
}
