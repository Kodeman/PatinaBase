'use client';

import { useMemo } from 'react';
import {
  PageHeader,
  MetricBlock,
  MetricsRow,
  Section,
  StatusDot,
  type StatusVariant,
} from '@/components/portal';
import { useSystemVersions } from '@/hooks/use-system-versions';
import type { VersionInfo, VersionStatus } from '@/app/api/admin/system/versions/route';

const STATUS_VARIANT: Record<VersionStatus, StatusVariant> = {
  current: 'success',
  behind: 'warning',
  unreachable: 'error',
};

const STATUS_LABEL: Record<VersionStatus, string> = {
  current: 'Current',
  behind: 'Behind',
  unreachable: 'Unreachable',
};

function shortSha(sha: string | null): string {
  if (!sha || sha === 'unknown') return '—';
  return sha.slice(0, 7);
}

function formatBuilt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function formatChecked(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString();
}

export default function DeploymentsPage() {
  const { data, isLoading, isError, error } = useSystemVersions();
  const apps: VersionInfo[] = data?.apps ?? [];

  const aggregate = useMemo(() => {
    const total = apps.length;
    const current = apps.filter((a) => a.status === 'current').length;
    const behind = apps.filter((a) => a.status === 'behind').length;
    const unreachable = apps.filter((a) => a.status === 'unreachable').length;
    return { total, current, behind, unreachable };
  }, [apps]);

  const allCurrent = aggregate.total > 0 && aggregate.current === aggregate.total;

  return (
    <div>
      <PageHeader
        title="System"
        accent="Deployments"
        description="Live build version of every portal and service. Each row reports the git SHA actually running; rows that differ from the expected SHA are behind. Polled every 30 seconds."
      />

      <MetricsRow>
        <MetricBlock
          label="Up to date"
          value={`${aggregate.current}/${aggregate.total}`}
          change={!data ? 'Checking…' : allCurrent ? 'All on expected SHA' : 'Mismatch detected'}
          trend={allCurrent ? 'up' : 'neutral'}
        />
        <MetricBlock
          label="Behind"
          value={String(aggregate.behind)}
          change={!data ? 'Checking…' : aggregate.behind === 0 ? 'None behind' : 'Re-deploy needed'}
          trend={aggregate.behind === 0 ? 'up' : 'down'}
        />
        <MetricBlock
          label="Unreachable"
          value={String(aggregate.unreachable)}
          change={!data ? 'Checking…' : aggregate.unreachable === 0 ? 'All responding' : 'Investigate now'}
          trend={aggregate.unreachable === 0 ? 'up' : 'down'}
        />
        <MetricBlock
          label="Expected SHA"
          value={shortSha(data?.expectedSha ?? null)}
          change={data?.checkedAt ? `Checked ${formatChecked(data.checkedAt)}` : 'Auto-refresh 30s'}
          trend="neutral"
        />
      </MetricsRow>

      {isError ? (
        <Section title="Deployed Versions" className="mt-10">
          <div className="border border-[var(--color-error)]/40 bg-[var(--color-error)]/5 px-4 py-3 text-[var(--color-error)] type-body-small">
            Failed to load versions: {(error as Error)?.message ?? 'unknown error'}
          </div>
        </Section>
      ) : (
        <Section title="Deployed Versions" className="mt-10">
          {apps.length === 0 && isLoading ? (
            <div className="type-meta py-8 text-center">Checking versions…</div>
          ) : (
            <div>
              {apps.map((app) => (
                <div
                  key={app.name}
                  className="flex items-center justify-between border-b border-[var(--border-subtle)] py-4 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <StatusDot variant={STATUS_VARIANT[app.status]} />
                    <span className="type-item-name">{app.name}</span>
                    <span className="type-meta-small text-[var(--text-muted)]">{app.kind}</span>
                    {app.message && (
                      <span className="type-meta-small text-[var(--text-muted)]">{app.message}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <div className="type-meta-small">Version</div>
                      <div className="type-body-small font-mono">{app.version ?? '—'}</div>
                    </div>
                    <div className="text-right">
                      <div className="type-meta-small">Git SHA</div>
                      <div className="type-body-small font-mono">{shortSha(app.gitSha)}</div>
                    </div>
                    <div className="text-right">
                      <div className="type-meta-small">Built</div>
                      <div className="type-body-small font-mono">{formatBuilt(app.buildTime)}</div>
                    </div>
                    <StatusDot
                      variant={STATUS_VARIANT[app.status]}
                      label={STATUS_LABEL[app.status]}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
