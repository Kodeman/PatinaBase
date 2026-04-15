'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  mediaAssets,
  mediaProcessingJobs,
  mediaQualityQueue,
  type MediaAssetKind,
  type MediaAssetPreview,
} from '@/data/mock-admin';
import { Filter, LayoutGrid, List, Upload, TriangleAlert } from 'lucide-react';
import {
  PageHeader,
  MetricBlock,
  MetricsRow,
  Section,
  FilterTabs,
  EmptyState,
  StatusDot,
  type StatusVariant,
} from '@/components/portal';

const assetFilters: { label: string; value: 'all' | MediaAssetKind }[] = [
  { label: 'All assets', value: 'all' },
  { label: 'Images', value: 'image' },
  { label: '3D models', value: 'model3d' },
  { label: 'Video loops', value: 'video' },
];

const statusVariantMap: Record<string, StatusVariant> = {
  ready: 'success',
  processing: 'warning',
  queued: 'info',
  failed: 'error',
};

const statusCopy: Record<string, string> = {
  ready: 'Ready',
  processing: 'Processing',
  queued: 'Queued',
  failed: 'Failed',
};

function AssetCard({
  asset,
  isSelected,
  onSelect,
  viewMode,
}: {
  asset: MediaAssetPreview;
  isSelected: boolean;
  onSelect: (asset: MediaAssetPreview) => void;
  viewMode: 'grid' | 'list';
}) {
  if (viewMode === 'list') {
    return (
      <button
        onClick={() => onSelect(asset)}
        className={cn(
          'w-full border border-[var(--border-subtle)] p-4 text-left transition-colors hover:bg-[var(--bg-hover)]',
          isSelected && 'border-[var(--accent-primary)] bg-[rgba(196,165,123,0.06)]'
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="type-label">{asset.title}</p>
            <p className="type-meta-small mt-0.5">{asset.productSku} · {asset.role}</p>
          </div>
          <StatusDot variant={statusVariantMap[asset.status]} label={statusCopy[asset.status]} />
        </div>
        <div className="type-meta-small mt-3 grid gap-3 sm:grid-cols-3">
          <span>{asset.resolution}</span>
          <span>{asset.sizeMb} MB</span>
          <span>Checksum {asset.checksum}</span>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={() => onSelect(asset)}
      className={cn(
        'flex flex-col border border-[var(--border-subtle)] p-4 text-left transition-all hover:-translate-y-[1px] hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2',
        isSelected && 'border-[var(--accent-primary)] bg-[rgba(196,165,123,0.06)]'
      )}
    >
      <div className={cn('h-32 w-full rounded-sm bg-gradient-to-br', asset.accentColor)} />
      <div className="mt-4 flex flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="type-item-name">{asset.title}</p>
            <p className="type-meta-small mt-0.5">{asset.productSku} · {asset.role}</p>
          </div>
          <StatusDot variant={statusVariantMap[asset.status]} label={statusCopy[asset.status]} />
        </div>
        <div className="type-meta-small grid grid-cols-2 gap-2">
          <span>{asset.resolution}</span>
          <span className="text-right">{asset.sizeMb} MB</span>
          <span>{asset.owner}</span>
          <span className="text-right">Checksum {asset.checksum}</span>
        </div>
      </div>
    </button>
  );
}

export default function MediaPage() {
  const [activeFilter, setActiveFilter] = useState<'all' | MediaAssetKind>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filteredAssets = useMemo(() => {
    if (activeFilter === 'all') return mediaAssets;
    return mediaAssets.filter((asset) => asset.kind === activeFilter);
  }, [activeFilter]);

  const [selectedAsset, setSelectedAsset] = useState<MediaAssetPreview | undefined>(
    filteredAssets[0]
  );
  const selectedAssetId = selectedAsset?.id;

  useEffect(() => {
    if (!filteredAssets.length) {
      setSelectedAsset(undefined);
      return;
    }
    if (!selectedAssetId || !filteredAssets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAsset(filteredAssets[0]);
    }
  }, [filteredAssets, selectedAssetId]);

  return (
    <div>
      <PageHeader
        title="Media"
        accent="Management"
        description="Track ingestion, quality control, and 3D asset readiness."
        actions={
          <div className="flex gap-2">
            <Button variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              Saved Views
            </Button>
            <Button>
              <Upload className="mr-2 h-4 w-4" />
              Upload Batch
            </Button>
          </div>
        }
      />

      <MetricsRow columns={3}>
        <MetricBlock
          label="Total Assets"
          value={mediaAssets.length}
          change="+182 this week"
          trend="up"
        />
        <MetricBlock
          label="Active Jobs"
          value={mediaProcessingJobs.length}
          change={`${mediaProcessingJobs.filter((j) => j.progress < 100).length} in progress`}
          trend="neutral"
        />
        <MetricBlock
          label="QC Issues"
          value={mediaQualityQueue.length}
          change="Auto-assign enabled"
          trend="down"
        />
      </MetricsRow>

      <div className="mt-10 grid gap-10 lg:grid-cols-[2fr,1fr]">
        <Section title="Asset Browser">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <FilterTabs
              items={assetFilters.map((f) => ({ value: f.value, label: f.label }))}
              value={activeFilter}
              onChange={setActiveFilter}
              className="border-b-0"
            />
            <div className="ml-auto flex gap-2">
              <Button
                size="icon"
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="sr-only">Grid view</span>
              </Button>
              <Button
                size="icon"
                variant={viewMode === 'list' ? 'default' : 'outline'}
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
                <span className="sr-only">List view</span>
              </Button>
            </div>
          </div>

          {filteredAssets.length === 0 ? (
            <EmptyState message="No assets match this filter." />
          ) : (
            <ScrollArea className="h-[520px] pr-4">
              <div
                className={cn(
                  'gap-4',
                  viewMode === 'grid' ? 'grid sm:grid-cols-2 xl:grid-cols-3' : 'flex flex-col'
                )}
              >
                {filteredAssets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    isSelected={asset.id === selectedAsset?.id}
                    onSelect={setSelectedAsset}
                    viewMode={viewMode}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </Section>

        <div className="space-y-10">
          <Section title="Selected Asset">
            {selectedAsset ? (
              <div className="space-y-4">
                <div
                  className={cn('h-40 rounded-sm bg-gradient-to-br', selectedAsset.accentColor)}
                />
                <div>
                  <p className="type-item-name">{selectedAsset.title}</p>
                  <p className="type-label-secondary">
                    SKU {selectedAsset.productSku} · {selectedAsset.role}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="type-meta-small">Resolution</p>
                    <p className="type-body-small">{selectedAsset.resolution}</p>
                  </div>
                  <div>
                    <p className="type-meta-small">File size</p>
                    <p className="type-body-small">{selectedAsset.sizeMb} MB</p>
                  </div>
                  <div>
                    <p className="type-meta-small">Owner</p>
                    <p className="type-body-small">{selectedAsset.owner}</p>
                  </div>
                  <div>
                    <p className="type-meta-small">Checksum</p>
                    <p className="font-mono text-[0.7rem]">{selectedAsset.checksum}</p>
                  </div>
                </div>
                {selectedAsset.issues && selectedAsset.issues.length > 0 ? (
                  <div className="border border-dashed border-[var(--color-warning)] p-3">
                    <p className="type-meta-small text-[var(--color-warning)]">QA follow-ups</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-[0.85rem]">
                      {selectedAsset.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="type-body-small italic text-[var(--text-muted)]">
                    No open issues on this asset.
                  </p>
                )}
              </div>
            ) : (
              <EmptyState message="Select an asset to view details." />
            )}
          </Section>

          <Section title="Processing Queue">
            <div className="space-y-4">
              {mediaProcessingJobs.map((job) => (
                <div
                  key={job.id}
                  className="space-y-2 border-b border-[var(--border-subtle)] py-3 last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <p className="type-label">{job.asset}</p>
                    <Badge variant="outline">{job.stage}</Badge>
                  </div>
                  <Progress value={job.progress} />
                  <p className="type-meta-small">
                    Started{' '}
                    {new Date(job.startedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    · ETA {job.etaMinutes}m
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="QC Queue">
            <div className="space-y-4">
              {mediaQualityQueue.map((item) => {
                const variant: StatusVariant =
                  item.severity === 'high'
                    ? 'error'
                    : item.severity === 'medium'
                      ? 'warning'
                      : 'neutral';
                return (
                  <div
                    key={item.id}
                    className="border-b border-[var(--border-subtle)] py-3 last:border-b-0"
                  >
                    <div className="flex items-center justify-between">
                      <p className="type-label">{item.asset}</p>
                      <StatusDot variant={variant} label={item.severity} />
                    </div>
                    <p className="type-body-small text-[var(--text-muted)]">{item.issue}</p>
                    <p className="type-meta-small">
                      Assigned to {item.assignedTo} ·{' '}
                      {new Date(item.submittedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
