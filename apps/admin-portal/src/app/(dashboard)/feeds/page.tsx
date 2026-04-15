'use client';

import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useVendors, useCoworkTasks, useCreateCoworkTask } from '@/hooks/use-pipeline';
import { useToast } from '@/components/ui/use-toast';
import {
  PageHeader,
  Section,
  EmptyState,
  LoadingStrata,
  DataTable,
  type Column,
  StatusDot,
  type StatusVariant,
} from '@/components/portal';

type Vendor = NonNullable<ReturnType<typeof useVendors>['data']>[number];

function statusVariant(status: string): StatusVariant {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'running' || status === 'pending' || status === 'picked_up') return 'warning';
  return 'neutral';
}

export default function FeedMonitorPage() {
  const { data: vendors, isLoading: vendorsLoading } = useVendors({ stage: 'live' });
  const { data: feedTasks } = useCoworkTasks({ task_type: 'feed_sync', limit: 200 });
  const createTask = useCreateCoworkTask();
  const { toast } = useToast();

  const lastSyncByVendor = useMemo(() => {
    type FeedTask = NonNullable<typeof feedTasks>[number];
    const map: Record<string, FeedTask | undefined> = {};
    for (const t of feedTasks ?? []) {
      if (!t.vendor_id) continue;
      const existing = map[t.vendor_id];
      if (!existing || new Date(t.created_at) > new Date(existing.created_at)) {
        map[t.vendor_id] = t;
      }
    }
    return map;
  }, [feedTasks]);

  const triggerSync = async (vendorId: string, vendorSlug: string, vendorName: string) => {
    try {
      await createTask.mutateAsync({
        task_type: 'feed_sync',
        vendor_id: vendorId,
        input_payload: { vendor_slug: vendorSlug },
      });
      toast({ title: `Feed sync queued for ${vendorName}` });
    } catch (err) {
      toast({
        title: 'Failed to queue sync',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  const columns: Column<Vendor>[] = [
    {
      key: 'name',
      header: 'Vendor',
      render: (v) => (
        <Link href={`/pipeline/${v.slug}` as any} className="hover:text-[var(--accent-primary)]">
          {v.name}
        </Link>
      ),
    },
    {
      key: 'format',
      header: 'Format',
      render: (v) => (
        <span className="type-meta-small">{v.data_format ?? '—'}</span>
      ),
    },
    {
      key: 'frequency',
      header: 'Frequency',
      render: (v) => <span className="type-meta-small">{v.feed_frequency ?? '—'}</span>,
    },
    {
      key: 'lastSync',
      header: 'Last Sync',
      render: (v) => {
        const last = lastSyncByVendor[v.id];
        return (
          <span className="type-body-small">
            {last?.completed_at
              ? formatDistanceToNow(new Date(last.completed_at), { addSuffix: true })
              : last
                ? `${last.status} (queued)`
                : 'never'}
          </span>
        );
      },
    },
    {
      key: 'products',
      header: 'Products',
      className: 'font-mono tabular-nums',
      render: (v) => {
        const last = lastSyncByVendor[v.id];
        const products = last?.output_payload
          ? (last.output_payload as Record<string, unknown>).products_imported
          : null;
        return <>{typeof products === 'number' ? products : '—'}</>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (v) => {
        const last = lastSyncByVendor[v.id];
        return <StatusDot variant={statusVariant(last?.status ?? 'idle')} label={last?.status ?? 'idle'} />;
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (v) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            triggerSync(v.id, v.slug, v.name);
          }}
          disabled={createTask.isPending}
        >
          Trigger sync
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Feed"
        accent="Monitor"
        description="Live partner feeds synced into Patina by Cowork."
      />

      <Section className="mt-10">
        {vendorsLoading ? (
          <LoadingStrata />
        ) : vendors && vendors.length === 0 ? (
          <EmptyState message="No live partners yet." />
        ) : (
          <DataTable columns={columns} rows={vendors ?? []} getKey={(v) => v.id} />
        )}
      </Section>
    </div>
  );
}
