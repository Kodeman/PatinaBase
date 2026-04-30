'use client';

import { useState } from 'react';
import {
  PageHeader,
  MetricBlock,
  MetricsRow,
  Section,
  DataTable,
  StatusDot,
  type Column,
} from '@/components/portal';
import { Switch } from '@/components/ui/switch';
import { formatDateTime } from '@/lib/utils';
import { useOutboxEvents } from '@/hooks/use-outbox-events';
import type { OutboxEventRow, OutboxSource } from '@/app/api/admin/outbox-events/route';

const SOURCE_BADGE: Record<OutboxSource, string> = {
  media: 'bg-[var(--color-info)]/15 text-[var(--color-info)]',
  orders: 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]',
};

const columns: Column<OutboxEventRow>[] = [
  {
    key: 'source',
    header: 'Source',
    width: 'w-[100px]',
    render: (e) => (
      <span
        className={`inline-flex items-center px-2 py-0.5 text-[0.7rem] font-mono uppercase rounded ${SOURCE_BADGE[e.source]}`}
      >
        {e.source}
      </span>
    ),
  },
  {
    key: 'type',
    header: 'Event type',
    render: (e) => <span className="font-mono text-[0.85rem]">{e.eventType}</span>,
  },
  {
    key: 'created',
    header: 'Created',
    render: (e) => <span className="type-meta-small">{formatDateTime(e.createdAt)}</span>,
  },
  {
    key: 'retries',
    header: 'Retries',
    className: 'font-mono tabular-nums',
    render: (e) => (
      <span className={e.retryCount > 0 ? 'text-[var(--color-warning)]' : ''}>
        {e.retryCount}
      </span>
    ),
  },
  {
    key: 'error',
    header: 'Last error',
    render: (e) =>
      e.lastError ? (
        <span className="type-meta-small text-[var(--color-error)] truncate block max-w-[280px]">
          {e.lastError}
        </span>
      ) : (
        <span className="type-meta-small italic text-[var(--text-muted)]">—</span>
      ),
  },
  {
    key: 'state',
    header: 'State',
    render: (e) =>
      e.published ? (
        <StatusDot variant="success" label="Published" />
      ) : e.retryCount > 0 ? (
        <StatusDot variant="warning" label="Retrying" />
      ) : (
        <StatusDot variant="info" label="Pending" />
      ),
  },
];

function formatAge(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

export default function SystemJobsPage() {
  const [unpublishedOnly, setUnpublishedOnly] = useState(true);
  const { data, isLoading, isError, error, isFetching } = useOutboxEvents(unpublishedOnly);

  const events = data?.events ?? [];
  const totals = data?.totals;
  const mediaCount = data?.counts.find((c) => c.source === 'media');
  const ordersCount = data?.counts.find((c) => c.source === 'orders');

  return (
    <div>
      <PageHeader
        title="System"
        accent="jobs"
        description="Outbox events across orders + media services. Polled every 30s."
      />

      <MetricsRow>
        <MetricBlock
          label="Unpublished"
          value={totals ? totals.unpublished.toLocaleString() : '—'}
          change={totals && totals.unpublished > 0 ? 'Drain in progress' : 'Queue clear'}
          trend={totals && totals.unpublished > 0 ? 'neutral' : 'up'}
        />
        <MetricBlock
          label="Oldest pending"
          value={totals ? formatAge(totals.oldestUnpublished) : '—'}
          change={totals?.oldestUnpublished ? 'Age of oldest unpublished' : 'No backlog'}
          trend={totals?.oldestUnpublished ? 'down' : 'up'}
        />
        <MetricBlock
          label="Media unpublished"
          value={mediaCount ? mediaCount.unpublished.toLocaleString() : '—'}
          change={mediaCount ? `${mediaCount.published.toLocaleString()} published` : ''}
          trend="neutral"
        />
        <MetricBlock
          label="Orders unpublished"
          value={ordersCount ? ordersCount.unpublished.toLocaleString() : '—'}
          change={ordersCount ? `${ordersCount.published.toLocaleString()} published` : ''}
          trend="neutral"
        />
      </MetricsRow>

      <Section className="mt-10">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={unpublishedOnly} onCheckedChange={setUnpublishedOnly} />
            <span className="type-label">Unpublished only</span>
          </label>
          <div className="ml-auto type-meta-small text-[var(--text-muted)]">
            {isFetching ? 'Loading…' : `${events.length.toLocaleString()} events`}
          </div>
        </div>

        {isError ? (
          <div className="border border-[var(--color-error)]/40 bg-[var(--color-error)]/5 px-4 py-3 text-[var(--color-error)] type-body-small">
            Failed to load outbox: {(error as Error)?.message ?? 'unknown error'}
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={events}
            getKey={(e) => `${e.source}:${e.id}`}
            emptyMessage={
              isLoading
                ? 'Loading outbox…'
                : unpublishedOnly
                  ? 'No unpublished events. Queue is clear.'
                  : 'No events.'
            }
          />
        )}
      </Section>
    </div>
  );
}
