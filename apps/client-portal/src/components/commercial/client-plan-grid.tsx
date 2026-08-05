'use client';

import { useClientPlan } from '@/hooks/use-commercial-client';

// Whole-dollar, no cents — matches the rest of the commercial-document rail
// (commercial-document-shell.tsx, project-commercial-summary.tsx), which
// intentionally differs from @patina/shared's formatCurrency (keeps cents).
function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatPublishedDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * "The plan" — the room-by-category working budget grid on the commercial
 * rail. Replaces BudgetOverview for commercial projects: planned (target)
 * vs. agreed so far (authorized), dated to the published checkpoint. A line
 * running over target is stated in words, never flagged in red — this is a
 * planning read, not an alarm.
 */
export function ClientPlanGrid({ projectId }: { projectId: string }) {
  const { data: plan, isLoading, isError } = useClientPlan(projectId);

  if (isLoading) {
    return (
      <div className="mt-8 py-6">
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--color-pearl)]" />
      </div>
    );
  }

  if (isError || !plan || plan.lines.length === 0) return null;

  const publishedLabel = formatPublishedDate(plan.publishedAt);

  return (
    <section className="mt-8" data-testid="client-plan-grid">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="type-section-head">The plan</h2>
        {publishedLabel && (
          <p className="type-meta-small text-[var(--text-muted)]">{`Budget as of ${publishedLabel}`}</p>
        )}
      </div>

      <div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-4 py-2 type-meta-small text-[var(--text-muted)]">
          <span>Room</span>
          <span>Category</span>
          <span className="text-right">Planned (target)</span>
          <span className="text-right">Agreed so far</span>
        </div>
        {plan.lines.map((line) => {
          const overTargetCents = line.authorizedCents - line.targetCents;
          return (
            <div
              key={line.id}
              className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-4 py-3 type-body-small"
              data-testid="client-plan-row"
            >
              <span className="text-[var(--text-primary)]">{line.roomName}</span>
              <span className="text-[var(--text-muted)]">{line.category}</span>
              <span className="text-right">{money(line.targetCents)}</span>
              <div className="text-right">
                <span>{money(line.authorizedCents)}</span>
                {overTargetCents > 0 && (
                  <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
                    {`${money(overTargetCents)} over the room’s target`}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
