'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  GitMerge,
  HardDrive,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  Skeleton,
  toast,
} from '@patina/design-system';
import {
  useDuplicateReport,
  useBulkDuplicateScan,
  useDismissDuplicate,
  useMarkAsDuplicate,
  useMergeDuplicates,
} from '@patina/supabase/hooks';
import type { DuplicateGroup, DuplicateMatch } from '@patina/supabase/hooks';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function SimilarityBadge({ similarity }: { similarity: number }) {
  const rounded = Math.round(similarity);
  let color: 'error' | 'warning' | 'success' | 'info' = 'info';
  if (rounded >= 95) color = 'error';
  else if (rounded >= 85) color = 'warning';
  else if (rounded >= 70) color = 'success';

  return (
    <Badge variant="solid" color={color} size="sm">
      {rounded}%
    </Badge>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS CARDS
// ═══════════════════════════════════════════════════════════════════════════

function StatsCards({
  totalImages,
  totalDuplicateGroups,
  totalDuplicateImages,
  estimatedStorageSavings,
}: {
  totalImages: number;
  totalDuplicateGroups: number;
  totalDuplicateImages: number;
  estimatedStorageSavings: number;
}) {
  const stats = [
    {
      label: 'Total Images',
      value: totalImages.toLocaleString(),
      icon: Copy,
      color: 'text-blue-600',
    },
    {
      label: 'Duplicate Groups',
      value: totalDuplicateGroups.toLocaleString(),
      icon: AlertTriangle,
      color: 'text-amber-600',
    },
    {
      label: 'Duplicate Images',
      value: totalDuplicateImages.toLocaleString(),
      icon: GitMerge,
      color: 'text-red-600',
    },
    {
      label: 'Est. Storage Savings',
      value: formatBytes(estimatedStorageSavings),
      icon: HardDrive,
      color: 'text-green-600',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className={`rounded-lg bg-muted p-2 ${stat.color}`}>
              <stat.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-bold">{stat.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DUPLICATE GROUP ROW
// ═══════════════════════════════════════════════════════════════════════════

interface DuplicateGroupRowProps {
  group: DuplicateGroup;
  onDismiss: (originalId: string, match: DuplicateMatch) => void;
  onMark: (originalId: string, match: DuplicateMatch) => void;
  onMerge: (originalId: string, match: DuplicateMatch) => void;
  isActioning: boolean;
}

function DuplicateGroupRow({
  group,
  onDismiss,
  onMark,
  onMerge,
  isActioning,
}: DuplicateGroupRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card>
      <CardContent className="p-0">
        {/* Group header */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Copy className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium">
                Original: {group.originalId.slice(0, 12)}...
              </p>
              <p className="text-sm text-muted-foreground">
                {group.count} duplicate{group.count !== 1 ? 's' : ''} found
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {group.duplicates.map((dup) => (
              <SimilarityBadge key={dup.assetId} similarity={dup.similarity} />
            ))}
            <span className="ml-2 text-muted-foreground">
              {isExpanded ? '\u25B2' : '\u25BC'}
            </span>
          </div>
        </button>

        {/* Expanded: list of duplicates */}
        {isExpanded && (
          <div className="border-t border-border">
            {group.duplicates.map((match) => (
              <div
                key={match.assetId}
                className="flex items-center justify-between border-b border-border last:border-0 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {/* Thumbnail placeholder */}
                  <div className="h-12 w-12 shrink-0 rounded bg-muted flex items-center justify-center">
                    {match.product?.images?.[0] ? (
                      <img
                        src={match.product.images[0]}
                        alt={match.product.name || 'Duplicate'}
                        className="h-full w-full rounded object-cover"
                      />
                    ) : (
                      <Copy className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {match.product?.name || `Asset ${match.assetId.slice(0, 8)}...`}
                    </p>
                    <div className="flex items-center gap-2">
                      {match.product?.vendorName && (
                        <span className="text-xs text-muted-foreground">
                          {match.product.vendorName}
                        </span>
                      )}
                      <SimilarityBadge similarity={match.similarity} />
                    </div>
                  </div>
                </div>

                {/* Row actions */}
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onMark(group.originalId, match)}
                    disabled={isActioning}
                    title="Mark as duplicate"
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onMerge(group.originalId, match)}
                    disabled={isActioning}
                    title="Merge into original"
                  >
                    <GitMerge className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDismiss(group.originalId, match)}
                    disabled={isActioning}
                    title="Dismiss"
                    className="text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function DuplicatesPage() {
  const {
    data: report,
    isLoading,
    error,
  } = useDuplicateReport();

  const bulkScan = useBulkDuplicateScan();
  const dismissMutation = useDismissDuplicate();
  const markMutation = useMarkAsDuplicate();
  const mergeMutation = useMergeDuplicates();

  const isActioning =
    dismissMutation.isPending ||
    markMutation.isPending ||
    mergeMutation.isPending;

  const handleBulkScan = async () => {
    try {
      await bulkScan.mutateAsync();
      toast({
        title: 'Scan complete',
        description: 'The duplicate scan has finished. Results are shown below.',
      });
    } catch {
      toast({
        title: 'Scan failed',
        description: 'Failed to run the duplicate scan. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDismiss = async (originalId: string, match: DuplicateMatch) => {
    try {
      await dismissMutation.mutateAsync({
        productId: originalId,
        duplicateAssetId: match.assetId,
      });
      toast({ title: 'Dismissed', description: 'Duplicate pair dismissed.' });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to dismiss.',
        variant: 'destructive',
      });
    }
  };

  const handleMark = async (originalId: string, match: DuplicateMatch) => {
    const duplicateProductId = match.product?.id ?? match.assetId;
    try {
      await markMutation.mutateAsync({
        originalProductId: originalId,
        duplicateProductId,
      });
      toast({
        title: 'Marked',
        description: 'Product marked as duplicate.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to mark as duplicate.',
        variant: 'destructive',
      });
    }
  };

  const handleMerge = async (originalId: string, match: DuplicateMatch) => {
    const mergeProductId = match.product?.id ?? match.assetId;
    try {
      await mergeMutation.mutateAsync({
        keepProductId: originalId,
        mergeProductId,
      });
      toast({
        title: 'Merged',
        description: 'Products have been merged successfully.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to merge products.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Duplicate Detection
          </h1>
          <p className="text-muted-foreground">
            Identify and manage duplicate product images across the catalog
          </p>
        </div>
        <Button
          onClick={handleBulkScan}
          disabled={bulkScan.isPending}
        >
          {bulkScan.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {bulkScan.isPending ? 'Scanning...' : 'Run Bulk Scan'}
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <Alert variant="error">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load duplicate report. The media service may be unavailable.
            <div className="mt-1 text-xs">
              {error instanceof Error ? error.message : String(error)}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Report stats */}
      {report && (
        <>
          <StatsCards
            totalImages={report.totalImages}
            totalDuplicateGroups={report.totalDuplicateGroups}
            totalDuplicateImages={report.totalDuplicateImages}
            estimatedStorageSavings={report.estimatedStorageSavings}
          />

          {/* No duplicates */}
          {report.groups.length === 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>
                No duplicate images detected in the catalog. Run a bulk scan to check
                for newly added duplicates.
              </AlertDescription>
            </Alert>
          )}

          {/* Duplicate groups */}
          {report.groups.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Duplicate Groups ({report.groups.length})
                </h2>
              </div>
              {report.groups.map((group) => (
                <DuplicateGroupRow
                  key={group.originalId}
                  group={group}
                  onDismiss={handleDismiss}
                  onMark={handleMark}
                  onMerge={handleMerge}
                  isActioning={isActioning}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
