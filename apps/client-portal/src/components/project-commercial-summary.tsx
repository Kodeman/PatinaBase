'use client';

import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import {
  useAcknowledgeBudgetCheckpoint,
  useProjectCommercialSummary,
} from '@/hooks/use-commercial-client';
import type { WorkingBudgetVersion } from '@/lib/commercial-documents';

function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function ProjectCommercialSummary({ projectId }: { projectId: string }) {
  const { data, isLoading, isError } = useProjectCommercialSummary(projectId);
  const acknowledge = useAcknowledgeBudgetCheckpoint(projectId);

  if (isLoading) {
    return <div className="mt-8 h-28 animate-pulse rounded bg-[var(--color-pearl)]" />;
  }
  if (isError || !data) return null;
  if (!data.authority && !data.workingBudget && data.furnishingsAuthorizations.length === 0) return null;

  const authority = data.authority;
  const utilization = authority && authority.ceilingCents > 0
    ? Math.min(100, Math.round((authority.accruedCents / authority.ceilingCents) * 100))
    : 0;

  return (
    <section className="mt-8" data-testid="project-commercial-summary">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="type-meta text-[var(--text-muted)]">Commercial record</p>
          <h2 className="type-section-head mt-1">Services, working budget &amp; authorizations</h2>
        </div>
      </div>

      {authority && (
        <div className="mt-5 border-y border-[var(--border-default)] py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="type-meta">Design authorization · {authority.state.replace('_', ' ')}</p>
              <p className="type-data-large mt-1">
                {money(authority.remainingCents, authority.currency)} remaining
              </p>
            </div>
            <p className="type-body-small text-[var(--text-muted)]">
              {money(authority.accruedCents, authority.currency)} accrued of{' '}
              {money(authority.ceilingCents, authority.currency)}
            </p>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--border-subtle)]" aria-label={`${utilization}% of design authorization used`}>
            <div className="h-full bg-patina-aged-oak" style={{ width: `${utilization}%` }} />
          </div>
          {authority.pendingAuthorizationCents > 0 && (
            <p className="mt-3 border-l-2 border-patina-terracotta px-3 type-body-small">
              {money(authority.pendingAuthorizationCents, authority.currency)} of captured work is
              pending additional authorization and cannot yet be invoiced.
            </p>
          )}

          {authority.activity.length > 0 && (
            <div className="mt-5">
              <h3 className="type-meta">Work completed this period</h3>
              <div className="mt-2 divide-y divide-[var(--border-subtle)]">
                {authority.activity.map((item) => (
                  <div key={item.label} className="flex justify-between gap-4 py-2 type-body-small">
                    <span>{item.label} · {item.hours} hours</span>
                    <span>{money(item.amountCents, authority.currency)}</span>
                  </div>
                ))}
              </div>
              <p className="type-meta-small mt-2 text-[var(--text-muted)]">
                Curated service categories only; private studio working details are not part of this summary.
              </p>
            </div>
          )}

          {authority.rates.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer type-meta text-[var(--accent-primary)]">Signed role rates</summary>
              <div className="mt-2 divide-y divide-[var(--border-subtle)]">
                {authority.rates.map((rate) => (
                  <div key={rate.id} className="flex justify-between py-2 type-body-small">
                    <span>{rate.roleName}</span>
                    <span>{money(rate.hourlyRateCents, authority.currency)} / hr</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {data.workingBudget && (
        <WorkingBudgetCheckpointShell
          budget={data.workingBudget}
          acknowledging={acknowledge.isPending}
          acknowledged={acknowledge.isSuccess}
          error={acknowledge.error instanceof Error ? acknowledge.error.message : null}
          onAcknowledge={(checkpointId) => acknowledge.mutate(checkpointId)}
        />
      )}

      {data.furnishingsAuthorizations.length > 0 && (
        <div className="mt-6">
          <h3 className="type-section-head">Furnishings authorizations</h3>
          <div className="mt-3 divide-y divide-[var(--border-subtle)]">
            {data.furnishingsAuthorizations.map(({ document, furnishings }) => {
              const depositOutstanding = Math.max(
                (furnishings?.depositRequiredCents ?? 0) - (furnishings?.depositPaidCents ?? 0),
                0,
              );
              return (
                <Link
                  key={document.id}
                  href={`/proposals/${document.id}`}
                  className="flex items-start justify-between gap-4 py-3 no-underline"
                >
                  <div>
                    <p className="type-body-small font-medium text-[var(--text-primary)]">
                      {document.waveName ?? document.title}
                    </p>
                    <p className="type-meta-small mt-1 capitalize">{document.state.replace('_', ' ')}</p>
                  </div>
                  {document.state === 'executed' && depositOutstanding > 0 && (
                    <span className="type-meta-small text-patina-dusty-blue">
                      {money(depositOutstanding)} deposit due
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export function WorkingBudgetCheckpointShell({
  budget,
  acknowledging,
  acknowledged,
  error,
  onAcknowledge,
}: {
  budget: WorkingBudgetVersion;
  acknowledging: boolean;
  acknowledged: boolean;
  error: string | null;
  onAcknowledge: (checkpointId: string) => void;
}) {
  const checkpoint = budget.checkpoint;
  const isAcknowledged = acknowledged || checkpoint?.state === 'acknowledged';

  return (
    <div className="mt-6 border-y border-[var(--border-default)] py-5" data-testid="working-budget-checkpoint">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="type-meta">Working furnishing budget · version {budget.version}</p>
          <p className="type-data-large mt-1">{money(budget.targetTotalCents, budget.currency)} target</p>
          <p className="type-body-small mt-1 text-[var(--text-muted)]">
            {money(budget.lowTotalCents, budget.currency)} low · {money(budget.highTotalCents, budget.currency)} high
          </p>
        </div>
        {checkpoint && !isAcknowledged && checkpoint.state === 'published' && (
          <button
            type="button"
            disabled={acknowledging}
            onClick={() => onAcknowledge(checkpoint.id)}
            className="inline-flex items-center gap-2 rounded-[3px] bg-patina-charcoal px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {acknowledging && <Loader2 className="h-4 w-4 animate-spin" />}
            Acknowledge working budget
          </button>
        )}
        {isAcknowledged && (
          <p className="inline-flex items-center gap-2 type-meta text-patina-sage">
            <CheckCircle2 className="h-4 w-4" /> Checkpoint acknowledged
          </p>
        )}
      </div>

      <p className="mt-4 border-l-2 border-patina-dusty-blue bg-patina-dusty-blue/5 px-4 py-3 type-body-small">
        This is a nonbinding planning checkpoint. Acknowledging it records alignment on the working
        range; it does not authorize the studio to purchase anything.
      </p>

      {budget.lines.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer type-meta text-[var(--accent-primary)]">Room &amp; category ranges</summary>
          <div className="mt-2 divide-y divide-[var(--border-subtle)]">
            {budget.lines.map((line, index) => (
              <div key={`${line.roomName}-${line.category}-${index}`} className="grid grid-cols-[1fr_auto] gap-4 py-2 type-body-small">
                <span>{line.roomName} · {line.category}</span>
                <span>{money(line.lowCents, budget.currency)}–{money(line.highCents, budget.currency)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      {error && <p role="alert" className="mt-3 type-body-small text-patina-terracotta">{error}</p>}
    </div>
  );
}
