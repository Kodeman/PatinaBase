'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateTime } from '@/lib/utils';
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
import type { DesignerPayoutRow, PayoutStatus, PayoutsListResponse } from '@/app/api/admin/payouts/route';

const PAGE_SIZE = 50;

const STATUS_OPTIONS: Array<{ value: 'all' | PayoutStatus; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

const STATUS_VARIANT: Record<PayoutStatus, StatusVariant> = {
  pending: 'warning',
  processing: 'info',
  completed: 'success',
  failed: 'error',
};

function formatCents(cents: number, currency = 'USD'): string {
  if (currency === 'USD') {
    return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `${(cents / 100).toLocaleString()} ${currency}`;
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(s)} – ${fmt(e)}`;
}

const columns: Column<DesignerPayoutRow>[] = [
  {
    key: 'designer',
    header: 'Designer',
    render: (p) => (
      <div>
        <div className="type-item-name">{p.designerName ?? p.designerEmail ?? '—'}</div>
        {p.designerEmail && p.designerName && (
          <div className="type-meta-small mt-0.5">{p.designerEmail}</div>
        )}
      </div>
    ),
  },
  {
    key: 'period',
    header: 'Period',
    render: (p) => <span className="type-meta-small">{formatPeriod(p.periodStart, p.periodEnd)}</span>,
  },
  {
    key: 'amount',
    header: 'Amount',
    className: 'font-mono tabular-nums',
    render: (p) => formatCents(p.amountCents, p.currency),
  },
  {
    key: 'method',
    header: 'Method',
    render: (p) => (
      <span className="type-meta-small">
        {p.paymentMethod ?? <span className="italic text-[var(--text-muted)]">—</span>}
      </span>
    ),
  },
  {
    key: 'processed',
    header: 'Processed',
    render: (p) => (
      <span className="type-meta-small">
        {p.processedAt ? formatDateTime(p.processedAt) : <span className="italic text-[var(--text-muted)]">—</span>}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (p) => <StatusDot variant={STATUS_VARIANT[p.status]} label={p.status} />,
  },
];

async function fetchPayouts(filters: {
  status: 'all' | PayoutStatus;
  page: number;
}): Promise<PayoutsListResponse> {
  const params = new URLSearchParams();
  if (filters.status !== 'all') params.set('status', filters.status);
  params.set('page', String(filters.page));
  params.set('pageSize', String(PAGE_SIZE));
  const res = await fetch(`/api/admin/payouts?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load payouts (${res.status})`);
  }
  const json = (await res.json()) as { data: PayoutsListResponse };
  return json.data;
}

export default function PayoutsPage() {
  const [status, setStatus] = useState<'all' | PayoutStatus>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['admin-payouts', status, page],
    queryFn: () => fetchPayouts({ status, page }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];
  const totals = data?.totals;
  const total = data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Designer"
        accent="payouts"
        description="Earnings and payout batches across the designer network."
      />

      <MetricsRow>
        <MetricBlock
          label="Pending payouts"
          value={totals ? formatCents(totals.pendingCents) : '—'}
          change="Awaiting processing"
          trend={totals && totals.pendingCents > 0 ? 'neutral' : 'up'}
        />
        <MetricBlock
          label="In processing"
          value={totals ? formatCents(totals.processingCents) : '—'}
          change="In flight"
          trend="neutral"
        />
        <MetricBlock
          label="Completed (30d)"
          value={totals ? formatCents(totals.completedCentsLast30Days) : '—'}
          change="Last 30 days"
          trend="up"
        />
        <MetricBlock
          label="Failed"
          value={totals ? totals.failedCount.toLocaleString() : '—'}
          change={totals && totals.failedCount > 0 ? 'Investigate' : 'No failures'}
          trend={totals && totals.failedCount > 0 ? 'down' : 'up'}
        />
      </MetricsRow>

      <Section className="mt-10">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as typeof status);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All statuses" />
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
            {isFetching ? 'Loading…' : `${total.toLocaleString()} payouts`}
          </div>
        </div>

        {isError ? (
          <div className="border border-[var(--color-error)]/40 bg-[var(--color-error)]/5 px-4 py-3 text-[var(--color-error)] type-body-small">
            Failed to load payouts: {(error as Error)?.message ?? 'unknown error'}
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              getKey={(p) => p.id}
              emptyMessage={isLoading ? 'Loading payouts…' : 'No payouts match these filters.'}
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
