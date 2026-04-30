'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import {
  PageHeader,
  Section,
  DataTable,
  StatusDot,
  type Column,
} from '@/components/portal';
import { useAdminAuditLogs, type AdminAuditLogFilters } from '@/hooks/use-admin-audit-logs';
import type { AuditLogRow } from '@/app/api/admin/audit-logs/route';

const STATUS_OPTIONS: Array<{ value: 'all' | 'success' | 'failure' | 'denied'; label: string }> = [
  { value: 'all', label: 'All results' },
  { value: 'success', label: 'Success' },
  { value: 'failure', label: 'Failure' },
  { value: 'denied', label: 'Denied' },
];

const PAGE_SIZE = 50;

const columns: Column<AuditLogRow>[] = [
  {
    key: 'id',
    header: 'ID',
    width: 'w-[120px]',
    render: (l) => <span className="font-mono text-[0.75rem]">{l.id.slice(0, 8)}</span>,
  },
  {
    key: 'action',
    header: 'Action',
    render: (l) => <span className="font-mono text-[0.85rem]">{l.action}</span>,
  },
  {
    key: 'resource',
    header: 'Resource',
    render: (l) => (
      <span className="type-meta-small">
        {l.resourceType}
        {l.resourceId ? <span className="font-mono">/{l.resourceId.slice(0, 8)}</span> : null}
      </span>
    ),
  },
  {
    key: 'actor',
    header: 'Actor',
    render: (l) => l.actorEmail ?? l.actorName ?? <span className="italic text-[var(--text-muted)]">system</span>,
  },
  {
    key: 'timestamp',
    header: 'Timestamp',
    render: (l) => <span className="type-meta-small">{formatDateTime(l.createdAt)}</span>,
  },
  {
    key: 'status',
    header: 'Result',
    render: (l) => (
      <StatusDot
        variant={l.status === 'success' ? 'success' : l.status === 'denied' ? 'warning' : 'error'}
        label={l.status}
      />
    ),
  },
];

export default function AuditPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'success' | 'failure' | 'denied'>('all');
  const [page, setPage] = useState(1);

  const filters: AdminAuditLogFilters = {
    q: q.trim() || undefined,
    status: status === 'all' ? undefined : status,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading, isError, error, isFetching } = useAdminAuditLogs(filters);
  const rows = data?.rows ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Audit"
        accent="Logs"
        description="Immutable audit trail of all privileged actions."
      />

      <Section className="mt-10">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative max-w-md flex-1 min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              placeholder="Search action, resource type, or resource id…"
              className="pl-9"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as typeof status);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All results" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto type-meta-small text-[var(--text-muted)]">
            {isFetching ? 'Loading…' : `${total.toLocaleString()} events`}
          </div>
        </div>

        {isError ? (
          <div className="border border-[var(--color-error)]/40 bg-[var(--color-error)]/5 px-4 py-3 text-[var(--color-error)] type-body-small">
            Failed to load audit logs: {(error as Error)?.message ?? 'unknown error'}
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              getKey={(l) => l.id}
              emptyMessage={isLoading ? 'Loading audit events…' : 'No audit events match these filters.'}
            />

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <span className="type-meta-small text-[var(--text-muted)]">
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || isFetching}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
