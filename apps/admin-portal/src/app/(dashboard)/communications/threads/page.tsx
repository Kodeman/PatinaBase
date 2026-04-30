'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  PageHeader,
  Section,
  DataTable,
  StatusDot,
  type Column,
} from '@/components/portal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { useAdminThreads } from '@/hooks/use-admin-comms';
import type { AdminThreadRow, ThreadKind } from '@/app/api/admin/comms/threads/route';

const KIND_OPTIONS: Array<{ value: 'all' | ThreadKind; label: string }> = [
  { value: 'all', label: 'All kinds' },
  { value: 'direct', label: 'Direct' },
  { value: 'project', label: 'Project' },
  { value: 'vendor_brief', label: 'Vendor brief' },
  { value: 'support', label: 'Support' },
];

const KIND_VARIANT: Record<ThreadKind, 'default' | 'secondary' | 'outline'> = {
  direct: 'outline',
  project: 'default',
  vendor_brief: 'secondary',
  support: 'outline',
};

const PAGE_SIZE = 50;

const columns: Column<AdminThreadRow>[] = [
  {
    key: 'kind',
    header: 'Kind',
    width: 'w-[120px]',
    render: (t) => (
      <Badge variant={KIND_VARIANT[t.kind]} className="capitalize">
        {t.kind.replace('_', ' ')}
      </Badge>
    ),
  },
  {
    key: 'participants',
    header: 'Participants',
    render: (t) => (
      <div>
        <span className="type-meta-small">{t.participantCount} member(s)</span>
        <div className="mt-1 type-body-small text-[var(--text-muted)] truncate max-w-[280px]">
          {t.participants
            .map((p) => p.displayName ?? p.email ?? '?')
            .slice(0, 3)
            .join(', ')}
          {t.participants.length > 3 ? '…' : ''}
        </div>
      </div>
    ),
  },
  {
    key: 'title',
    header: 'Title',
    render: (t) =>
      t.title ? (
        <span className="type-item-name">{t.title}</span>
      ) : (
        <span className="italic text-[var(--text-muted)]">untitled</span>
      ),
  },
  {
    key: 'last',
    header: 'Last activity',
    render: (t) => <span className="type-meta-small">{formatDateTime(t.lastMessageAt)}</span>,
  },
  {
    key: 'open',
    header: '',
    width: 'w-[80px]',
    render: () => (
      <StatusDot variant="info" />
    ),
  },
];

export default function CommsThreadsPage() {
  const [kind, setKind] = useState<'all' | ThreadKind>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, isFetching } = useAdminThreads({
    kind,
    page,
    pageSize: PAGE_SIZE,
  });

  const threads = data?.threads ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Communications"
        accent="threads"
        description="Read-only audit of in-app threads. v1 supports viewing only — moderation actions deferred per the in-app messaging PRD."
      />

      <Section className="mt-10">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Select
            value={kind}
            onValueChange={(v) => {
              setKind(v as typeof kind);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All kinds" />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto type-meta-small text-[var(--text-muted)]">
            {isFetching ? 'Loading…' : `${total.toLocaleString()} threads`}
          </div>
        </div>

        {isError ? (
          <div className="border border-[var(--color-error)]/40 bg-[var(--color-error)]/5 px-4 py-3 text-[var(--color-error)] type-body-small">
            Failed to load threads: {(error as Error)?.message ?? 'unknown error'}
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={threads}
              getKey={(t) => t.id}
              onRowHref={(t) => `/communications/threads/${t.id}`}
              emptyMessage={
                isLoading ? 'Loading threads…' : 'No threads match these filters.'
              }
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

      <p className="mt-8 type-meta-small text-[var(--text-muted)]">
        Looking for a specific message?{' '}
        <Link href={'/audit' as any} className="underline">
          /audit
        </Link>{' '}
        records moderation actions; this view shows raw thread state.
      </p>
    </div>
  );
}
