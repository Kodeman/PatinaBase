'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@patina/design-system';
// REPLACED: card';
import { Button } from '@patina/design-system';
// REPLACED: button';
import { Badge } from '@patina/design-system';
// REPLACED: badge';
import { ProgressBar as Progress } from '@patina/design-system';
// REPLACED: progress';
import { ScrollArea } from '@patina/design-system';
// REPLACED: scroll-area';
import { cn } from '@/lib/utils';
import {
  mediaAssets,
  mediaProcessingJobs,
  mediaQualityQueue,
  type MediaAssetKind,
  type MediaAssetPreview,
} from '@/data/mock-admin';
import {
  Filter,
  LayoutGrid,
  List,
  Upload,
  CheckCircle2,
  Clock3,
  TriangleAlert,
} from 'lucide-react';

const assetFilters: { label: string; value: 'all' | MediaAssetKind }[] = [
  { label: 'All assets', value: 'all' },
  { label: 'Images', value: 'image' },
  { label: '3D models', value: 'model3d' },
  { label: 'Video loops', value: 'video' },
];

const statusVariant = {
  ready: 'success',
  processing: 'warning',
  queued: 'secondary',
  failed: 'destructive',
} as const;

const statusCopy = {
  ready: 'Ready',
  processing: 'Processing',
  queued: 'Queued',
  failed: 'Failed',
} as const;

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
          'w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted/50',
          isSelected && 'border-primary bg-primary/5'
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">{asset.title}</p>
            <p className="text-xs text-muted-foreground">
              {asset.productSku} • {asset.role}
            </p>
          </div>
          <Badge variant={statusVariant[asset.status]}>
            {statusCopy[asset.status]}
          </Badge>
        </div>
        <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
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
        'flex flex-col rounded-2xl border p-4 text-left transition-all hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isSelected && 'border-primary/60 shadow-lg shadow-primary/10'
      )}
    >
      <div className={cn('h-32 w-full rounded-xl bg-gradient-to-br', asset.accentColor)} />
      <div className="mt-4 flex flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium leading-tight">{asset.title}</p>
            <p className="text-xs text-muted-foreground">
              {asset.productSku} • {asset.role}
            </p>
          </div>
          <Badge variant={statusVariant[asset.status]}>
            {statusCopy[asset.status]}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
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

  const metrics = [
    {
      label: 'Total Assets',
      value: mediaAssets.length.toLocaleString(),
      detail: '+182 imported this week',
      icon: <CheckCircle2 className="h-4 w-4 text-success" />,
    },
    {
      label: 'Active Jobs',
      value: mediaProcessingJobs.length.toString(),
      detail: `${mediaProcessingJobs.filter((job) => job.progress < 100).length} in progress`,
      icon: <Clock3 className="h-4 w-4 text-warning" />,
    },
    {
      label: 'QC Issues',
      value: mediaQualityQueue.length.toString(),
      detail: 'Auto-assign enabled',
      icon: <TriangleAlert className="h-4 w-4 text-destructive" />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Media Management</h1>
          <p className="text-muted-foreground">
            Track ingestion, quality control, and 3D asset readiness
          </p>
        </div>
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
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader className="flex items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{metric.label}</CardTitle>
              {metric.icon}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
              <p className="text-xs text-muted-foreground">{metric.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card className="flex flex-col">
          <CardHeader className="gap-4">
            <div>
              <CardTitle>Asset Browser</CardTitle>
              <CardDescription>Filter by type, status, and role</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {assetFilters.map((filter) => (
                <Button
                  key={filter.value}
                  size="sm"
                  variant={activeFilter === filter.value ? 'default' : 'outline'}
                  onClick={() => setActiveFilter(filter.value)}
                >
                  {filter.label}
                </Button>
              ))}
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
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden">
            {filteredAssets.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <TriangleAlert className="mb-2 h-6 w-6" />
                No assets match this filter
              </div>
            ) : (
              <ScrollArea className="h-[520px] pr-4">
                <div
                  className={cn(
                    'gap-4',
                    viewMode === 'grid'
                      ? 'grid sm:grid-cols-2 xl:grid-cols-3'
                      : 'flex flex-col'
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
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Selected Asset</CardTitle>
              <CardDescription>Metadata and QC state</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedAsset ? (
                <>
                  <div
                    className={cn(
                      'h-40 rounded-2xl bg-gradient-to-br shadow-inner',
                      selectedAsset.accentColor
                    )}
                  />
                  <div>
                    <p className="text-lg font-semibold">{selectedAsset.title}</p>
                    <p className="text-sm text-muted-foreground">
                      SKU {selectedAsset.productSku} • {selectedAsset.role}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Resolution</p>
                      <p className="font-medium">{selectedAsset.resolution}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">File size</p>
                      <p className="font-medium">{selectedAsset.sizeMb} MB</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Owner</p>
                      <p className="font-medium">{selectedAsset.owner}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Checksum</p>
                      <p className="font-mono text-xs">{selectedAsset.checksum}</p>
                    </div>
                  </div>
                  {selectedAsset.issues && selectedAsset.issues.length > 0 ? (
                    <div className="rounded-lg border border-dashed p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-warning">
                        QA follow-ups
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                        {selectedAsset.issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      No open issues on this asset
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Select an asset to view details.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Processing Queue</CardTitle>
              <CardDescription>Auto-pauses to protect throughput</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mediaProcessingJobs.map((job) => (
                <div key={job.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between text-sm">
                    <p className="font-medium">{job.asset}</p>
                    <Badge variant="outline">{job.stage}</Badge>
                  </div>
                  <Progress value={job.progress} />
                  <p className="text-xs text-muted-foreground">
                    Started {new Date(job.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ETA {job.etaMinutes}m
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>QC Queue</CardTitle>
              <CardDescription>Highest severity issues first</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mediaQualityQueue.map((item) => (
                <div key={item.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{item.asset}</p>
                    <Badge
                      variant={
                        item.severity === 'high'
                          ? 'destructive'
                          : item.severity === 'medium'
                          ? 'warning'
                          : 'secondary'
                      }
                    >
                      {item.severity}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.issue}</p>
                  <p className="text-xs text-muted-foreground">
                    Assigned to {item.assignedTo} • {new Date(item.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
