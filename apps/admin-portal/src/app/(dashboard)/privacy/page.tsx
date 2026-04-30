'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import {
  PageHeader,
  MetricBlock,
  MetricsRow,
  Section,
  DataTable,
  StatusDot,
  type Column,
  type StatusVariant,
} from '@/components/portal';
import { formatDateTime } from '@/lib/utils';
import {
  useApproveDeletion,
  useApproveExport,
  usePrivacyOverview,
} from '@/hooks/use-admin-privacy';
import type {
  ConsentRow,
  DeletionRequestRow,
  DeletionStatus,
  ExportRequestRow,
  ExportStatus,
} from '@/app/api/admin/privacy/route';

const EXPORT_STATUS_VARIANT: Record<ExportStatus, StatusVariant> = {
  pending: 'warning',
  processing: 'info',
  completed: 'success',
  failed: 'error',
  expired: 'neutral',
};

const DELETION_STATUS_VARIANT: Record<DeletionStatus, StatusVariant> = {
  pending: 'warning',
  processing: 'info',
  completed: 'success',
  cancelled: 'neutral',
  failed: 'error',
};

function ApproveButton({
  approvedAt,
  onClick,
  pending,
}: {
  approvedAt: string | null;
  onClick: () => void;
  pending: boolean;
}) {
  return approvedAt ? (
    <Button size="sm" variant="outline" onClick={onClick} disabled={pending}>
      Unapprove
    </Button>
  ) : (
    <Button size="sm" onClick={onClick} disabled={pending}>
      Approve
    </Button>
  );
}

export default function PrivacyPage() {
  const overview = usePrivacyOverview();
  const approveExport = useApproveExport();
  const approveDeletion = useApproveDeletion();
  const [tab, setTab] = useState('exports');

  const totals = overview.data?.totals;

  const exportColumns: Column<ExportRequestRow>[] = [
    {
      key: 'user',
      header: 'User',
      render: (r) => (
        <div>
          <div className="type-item-name">{r.userName ?? r.userEmail ?? r.userId.slice(0, 8)}</div>
          {r.userEmail && r.userName && (
            <div className="type-meta-small mt-0.5">{r.userEmail}</div>
          )}
        </div>
      ),
    },
    {
      key: 'requested',
      header: 'Requested',
      render: (r) => <span className="type-meta-small">{formatDateTime(r.requestedAt)}</span>,
    },
    {
      key: 'data',
      header: 'Includes',
      render: (r) => (
        <span className="type-meta-small">
          {r.includedData.length > 0 ? r.includedData.join(', ') : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusDot variant={EXPORT_STATUS_VARIANT[r.status]} label={r.status} />,
    },
    {
      key: 'approval',
      header: 'Approval',
      render: (r) =>
        r.approvedAt ? (
          <div>
            <span className="type-meta-small text-[var(--color-success)]">Approved</span>
            <div className="type-meta-small text-[var(--text-muted)]">
              {formatDateTime(r.approvedAt)}
              {r.approvedByEmail ? ` by ${r.approvedByEmail}` : ''}
            </div>
          </div>
        ) : (
          <span className="type-meta-small italic text-[var(--text-muted)]">Not approved</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <ApproveButton
          approvedAt={r.approvedAt}
          pending={approveExport.isPending}
          onClick={() =>
            approveExport.mutate({
              id: r.id,
              action: r.approvedAt ? 'unapprove' : 'approve',
            })
          }
        />
      ),
    },
  ];

  const deletionColumns: Column<DeletionRequestRow>[] = [
    {
      key: 'user',
      header: 'User',
      render: (r) => (
        <div>
          <div className="type-item-name">{r.userName ?? r.userEmail ?? r.userId.slice(0, 8)}</div>
          {r.userEmail && r.userName && (
            <div className="type-meta-small mt-0.5">{r.userEmail}</div>
          )}
        </div>
      ),
    },
    {
      key: 'requested',
      header: 'Requested',
      render: (r) => <span className="type-meta-small">{formatDateTime(r.requestedAt)}</span>,
    },
    {
      key: 'scheduled',
      header: 'Scheduled for',
      render: (r) => <span className="type-meta-small">{formatDateTime(r.scheduledFor)}</span>,
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (r) =>
        r.reason ? (
          <span className="type-body-small">{r.reason}</span>
        ) : (
          <span className="italic text-[var(--text-muted)] type-meta-small">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusDot variant={DELETION_STATUS_VARIANT[r.status]} label={r.status} />,
    },
    {
      key: 'approval',
      header: 'Approval',
      render: (r) =>
        r.approvedAt ? (
          <div>
            <span className="type-meta-small text-[var(--color-success)]">Approved</span>
            <div className="type-meta-small text-[var(--text-muted)]">
              {formatDateTime(r.approvedAt)}
              {r.approvedByEmail ? ` by ${r.approvedByEmail}` : ''}
            </div>
          </div>
        ) : (
          <span className="type-meta-small italic text-[var(--text-muted)]">Not approved</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <ApproveButton
          approvedAt={r.approvedAt}
          pending={approveDeletion.isPending}
          onClick={() =>
            approveDeletion.mutate({
              id: r.id,
              action: r.approvedAt ? 'unapprove' : 'approve',
            })
          }
        />
      ),
    },
  ];

  const consentColumns: Column<ConsentRow>[] = [
    {
      key: 'user',
      header: 'User',
      render: (r) => r.userEmail ?? r.userId.slice(0, 8),
    },
    {
      key: 'type',
      header: 'Consent type',
      render: (r) => <span className="font-mono text-[0.85rem]">{r.consentType}</span>,
    },
    {
      key: 'state',
      header: 'State',
      render: (r) => (
        <StatusDot
          variant={r.granted ? 'success' : 'neutral'}
          label={r.granted ? 'Granted' : 'Revoked'}
        />
      ),
    },
    {
      key: 'version',
      header: 'Version',
      render: (r) => (
        <span className="font-mono text-[0.75rem]">{r.consentVersion ?? '—'}</span>
      ),
    },
    {
      key: 'updated',
      header: 'Last change',
      render: (r) => <span className="type-meta-small">{formatDateTime(r.updatedAt)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Privacy"
        accent="requests"
        description="GDPR/CCPA Data Subject Request queues. v1 lets you triage and approve manually — actual export generation and scheduled deletion run in a follow-up worker."
      />

      <MetricsRow>
        <MetricBlock
          label="Open exports"
          value={totals ? totals.openExports.toLocaleString() : '—'}
          change={totals?.overdueExports ? `${totals.overdueExports} overdue (>30d)` : 'Within SLA'}
          trend={totals?.overdueExports ? 'down' : 'up'}
        />
        <MetricBlock
          label="Open deletions"
          value={totals ? totals.openDeletions.toLocaleString() : '—'}
          change="Pending grace period"
          trend="neutral"
        />
        <MetricBlock
          label="Consent revocations (30d)"
          value={totals ? totals.revokedConsents30d.toLocaleString() : '—'}
          change="Track for trends"
          trend="neutral"
        />
        <MetricBlock
          label="Refresh"
          value="60s"
          change="Auto-poll"
          trend="neutral"
        />
      </MetricsRow>

      <Alert className="mt-8">
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>v1 scope.</strong> Approve marks <code className="font-mono">approved_at</code>
          + <code className="font-mono">approved_by</code> on the request row. An out-of-band
          worker is responsible for actually generating exports or executing deletions. v1 does
          NOT check for legal holds (the schema doesn't track them yet) — verify externally before
          approving deletion requests.
        </AlertDescription>
      </Alert>

      {overview.isError ? (
        <Section className="mt-10">
          <div className="border border-[var(--color-error)]/40 bg-[var(--color-error)]/5 px-4 py-3 text-[var(--color-error)] type-body-small">
            Failed to load privacy data:{' '}
            {(overview.error as Error)?.message ?? 'unknown error'}
          </div>
        </Section>
      ) : (
        <Section className="mt-10">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="exports">
                Exports ({overview.data?.exports.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="deletions">
                Deletions ({overview.data?.deletions.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="consents">
                Consent ({overview.data?.consents.length ?? 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="exports" className="mt-6">
              <DataTable
                columns={exportColumns}
                rows={overview.data?.exports ?? []}
                getKey={(r) => r.id}
                emptyMessage={
                  overview.isLoading ? 'Loading export requests…' : 'No export requests.'
                }
              />
            </TabsContent>

            <TabsContent value="deletions" className="mt-6">
              <DataTable
                columns={deletionColumns}
                rows={overview.data?.deletions ?? []}
                getKey={(r) => r.id}
                emptyMessage={
                  overview.isLoading ? 'Loading deletion requests…' : 'No deletion requests.'
                }
              />
            </TabsContent>

            <TabsContent value="consents" className="mt-6">
              <DataTable
                columns={consentColumns}
                rows={overview.data?.consents ?? []}
                getKey={(r) => r.id}
                emptyMessage={
                  overview.isLoading ? 'Loading consent records…' : 'No consent records.'
                }
              />
            </TabsContent>
          </Tabs>
        </Section>
      )}
    </div>
  );
}
