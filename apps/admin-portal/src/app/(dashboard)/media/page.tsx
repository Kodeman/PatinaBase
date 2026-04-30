'use client';

import { useState } from 'react';
import {
  PageHeader,
  MetricBlock,
  MetricsRow,
  Section,
  FilterTabs,
  StatusDot,
  type StatusVariant,
} from '@/components/portal';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import {
  useAdminMediaAssets,
  type MediaAssetKind,
  type AdminMediaAsset,
} from '@/hooks/use-admin-media';

const KIND_FILTERS: Array<{ label: string; value: 'all' | MediaAssetKind }> = [
  { label: 'All', value: 'all' },
  { label: 'Images', value: 'IMAGE' },
  { label: '3D models', value: 'MODEL3D' },
  { label: 'Video', value: 'VIDEO' },
];

const STATUS_VARIANT: Record<string, StatusVariant> = {
  READY: 'success',
  PROCESSED: 'success',
  PROCESSING: 'warning',
  PENDING: 'info',
  QUEUED: 'info',
  FAILED: 'error',
  BLOCKED: 'error',
};

function statusVariant(status: string): StatusVariant {
  return STATUS_VARIANT[status.toUpperCase()] ?? 'neutral';
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AssetCard({ asset }: { asset: AdminMediaAsset }) {
  const thumb = asset.renditions.find((r) => r.purpose === 'THUMB' || r.purpose === 'thumb');
  return (
    <div className="border border-[var(--border-subtle)] p-4 hover:border-[var(--accent-primary)] transition-colors">
      <div
        className={`h-32 w-full rounded-sm flex items-center justify-center ${
          thumb ? '' : 'bg-gradient-to-br from-[var(--bg-muted)] to-[var(--border-subtle)]'
        }`}
      >
        <span className="type-meta-small text-[var(--text-muted)]">
          {asset.width && asset.height ? `${asset.width}×${asset.height}` : asset.kind}
        </span>
      </div>
      <div className="mt-4 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="type-item-name truncate">{asset.rawKey.split('/').pop() ?? asset.id}</p>
          <p className="type-meta-small mt-0.5 truncate">
            {asset.role ?? '—'} · {asset.format ?? '—'} · {formatSize(asset.sizeBytes)}
          </p>
        </div>
        <StatusDot variant={statusVariant(asset.status)} />
      </div>
      <p className="type-meta-small mt-2 text-[var(--text-muted)]">
        {formatDateTime(asset.createdAt)}
      </p>
    </div>
  );
}

export default function MediaPage() {
  const [kind, setKind] = useState<'all' | MediaAssetKind>('all');
  const [productId, setProductId] = useState('');

  const { data, isLoading, isError, error, isFetching } = useAdminMediaAssets({
    kind,
    productId: productId.trim() || undefined,
    limit: 60,
  });

  const assets = data?.assets ?? [];

  return (
    <div>
      <PageHeader
        title="Media"
        accent="library"
        description="Browse media assets across the platform. Backed by /v1/media/search on the media service."
      />

      <MetricsRow columns={3}>
        <MetricBlock
          label="Loaded"
          value={data ? data.count.toLocaleString() : '—'}
          change="In current view"
          trend="neutral"
        />
        <MetricBlock
          label="Has more"
          value={data ? (data.hasMore ? 'Yes' : 'No') : '—'}
          change={data?.hasMore ? 'Refine filters or paginate' : 'End of results'}
          trend="neutral"
        />
        <MetricBlock
          label="Filter"
          value={kind === 'all' ? 'All kinds' : kind}
          change={productId ? `productId=${productId.slice(0, 8)}…` : 'No product filter'}
          trend="neutral"
        />
      </MetricsRow>

      <Section className="mt-10">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <FilterTabs
            items={KIND_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
            value={kind}
            onChange={setKind}
            className="border-b-0"
          />
          <div className="relative w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              placeholder="Filter by product ID…"
              className="pl-9"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            />
          </div>
          <div className="ml-auto type-meta-small text-[var(--text-muted)]">
            {isFetching ? 'Loading…' : `${assets.length.toLocaleString()} shown`}
          </div>
        </div>

        {isError ? (
          <div className="border border-[var(--color-error)]/40 bg-[var(--color-error)]/5 px-4 py-3 text-[var(--color-error)] type-body-small">
            Failed to load media: {(error as Error)?.message ?? 'unknown error'}.
            {' '}If the media service isn't running, that's expected in dev — start it with{' '}
            <code className="font-mono">pnpm dev:backend</code>.
          </div>
        ) : assets.length === 0 ? (
          <p className="type-body italic text-[var(--text-muted)] py-12 text-center">
            {isLoading ? 'Loading assets…' : 'No assets match this filter.'}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
