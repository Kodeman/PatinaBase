'use client';

import { useState } from 'react';
import {
  Copy,
  Eye,
  GitMerge,
  Loader2,
  Search,
  X,
  AlertTriangle,
  CheckCircle2,
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
  useDuplicateCheck,
  useDismissDuplicate,
  useMarkAsDuplicate,
  useMergeDuplicates,
} from '@patina/supabase/hooks';
import type { DuplicateMatch } from '@patina/supabase/hooks';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface DuplicateDetectionPanelProps {
  /** The product ID to check for duplicates */
  productId: string;
  /** The current product's name (for display context) */
  productName?: string;
  /** The current product's primary image URL */
  productImage?: string;
  /** Callback when a duplicate action completes */
  onActionComplete?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMILARITY BADGE
// ═══════════════════════════════════════════════════════════════════════════

function SimilarityBadge({ similarity }: { similarity: number }) {
  const rounded = Math.round(similarity);
  let color: 'error' | 'warning' | 'success' | 'info' = 'info';

  if (rounded >= 95) {
    color = 'error';
  } else if (rounded >= 85) {
    color = 'warning';
  } else if (rounded >= 70) {
    color = 'success';
  }

  return (
    <Badge variant="solid" color={color} size="sm">
      {rounded}% match
    </Badge>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DUPLICATE CARD
// ═══════════════════════════════════════════════════════════════════════════

interface DuplicateCardProps {
  match: DuplicateMatch;
  productId: string;
  onDismiss: () => void;
  onMark: () => void;
  onMerge: () => void;
  isActioning: boolean;
}

function DuplicateCard({
  match,
  productId,
  onDismiss,
  onMark,
  onMerge,
  isActioning,
}: DuplicateCardProps) {
  const product = match.product;
  const imageUrl = product?.images?.[0];
  const formatPrice = (price: number | null | undefined) => {
    if (price == null) return '--';
    return `$${price.toLocaleString()}`;
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          {/* Thumbnail */}
          <div className="relative h-32 w-full shrink-0 bg-muted sm:h-auto sm:w-32">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={product?.name || 'Duplicate product'}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <Copy className="h-8 w-8" />
              </div>
            )}
            <div className="absolute right-2 top-2">
              <SimilarityBadge similarity={match.similarity} />
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-1 flex-col justify-between p-4">
            <div className="space-y-1">
              <h4 className="font-medium leading-tight">
                {product?.name || `Asset ${match.assetId.slice(0, 8)}...`}
              </h4>
              {product?.vendorName && (
                <p className="text-sm text-muted-foreground">
                  {product.vendorName}
                </p>
              )}
              <p className="text-sm font-medium">
                {formatPrice(product?.priceRetail)}
              </p>
            </div>

            {/* Actions */}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onMark}
                disabled={isActioning}
                className="text-xs"
              >
                <AlertTriangle className="mr-1 h-3 w-3" />
                Mark Duplicate
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onMerge}
                disabled={isActioning}
                className="text-xs"
              >
                <GitMerge className="mr-1 h-3 w-3" />
                Merge
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDismiss}
                disabled={isActioning}
                className="text-xs text-muted-foreground"
              >
                <X className="mr-1 h-3 w-3" />
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PANEL
// ═══════════════════════════════════════════════════════════════════════════

export function DuplicateDetectionPanel({
  productId,
  productName,
  productImage,
  onActionComplete,
}: DuplicateDetectionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    data: result,
    isLoading,
    error,
    refetch,
  } = useDuplicateCheck(isExpanded ? productId : undefined);

  const dismissMutation = useDismissDuplicate();
  const markMutation = useMarkAsDuplicate();
  const mergeMutation = useMergeDuplicates();

  const isActioning =
    dismissMutation.isPending ||
    markMutation.isPending ||
    mergeMutation.isPending;

  const allMatches = [
    ...(result?.exactMatches ?? []),
    ...(result?.similarMatches ?? []),
  ];
  const totalMatches = allMatches.length;
  const hasExactMatches = (result?.exactMatches?.length ?? 0) > 0;

  const handleDismiss = async (match: DuplicateMatch) => {
    try {
      await dismissMutation.mutateAsync({
        productId,
        duplicateAssetId: match.assetId,
      });
      toast({
        title: 'Duplicate dismissed',
        description: 'This match has been dismissed.',
      });
      onActionComplete?.();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to dismiss duplicate.',
        variant: 'destructive',
      });
    }
  };

  const handleMark = async (match: DuplicateMatch) => {
    const duplicateProductId = match.product?.id ?? match.assetId;
    try {
      await markMutation.mutateAsync({
        originalProductId: productId,
        duplicateProductId,
      });
      toast({
        title: 'Marked as duplicate',
        description: 'The product has been marked as a duplicate.',
      });
      onActionComplete?.();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to mark as duplicate.',
        variant: 'destructive',
      });
    }
  };

  const handleMerge = async (match: DuplicateMatch) => {
    const mergeProductId = match.product?.id ?? match.assetId;
    try {
      await mergeMutation.mutateAsync({
        keepProductId: productId,
        mergeProductId,
      });
      toast({
        title: 'Products merged',
        description: 'The duplicate product has been merged into this one.',
      });
      onActionComplete?.();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to merge products.',
        variant: 'destructive',
      });
    }
  };

  // Collapsed state - just show a button
  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        onClick={() => setIsExpanded(true)}
        className="w-full justify-start"
      >
        <Search className="mr-2 h-4 w-4" />
        Check for Duplicates
      </Button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Copy className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Duplicate Detection</h3>
          {totalMatches > 0 && (
            <Badge variant="solid" color={hasExactMatches ? 'error' : 'warning'} size="sm">
              {totalMatches} found
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <Alert variant="error">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to check for duplicates. The media service may be unavailable.
            <div className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : String(error)}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* No duplicates found */}
      {result && totalMatches === 0 && (
        <Alert>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription>
            No duplicates detected for this product. The image appears to be unique in the catalog.
          </AlertDescription>
        </Alert>
      )}

      {/* Exact matches */}
      {result && (result.exactMatches?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-red-600">
              Exact Matches ({result.exactMatches.length})
            </span>
          </div>
          {result.exactMatches.map((match) => (
            <DuplicateCard
              key={match.assetId}
              match={match}
              productId={productId}
              onDismiss={() => handleDismiss(match)}
              onMark={() => handleMark(match)}
              onMerge={() => handleMerge(match)}
              isActioning={isActioning}
            />
          ))}
        </div>
      )}

      {/* Similar matches */}
      {result && (result.similarMatches?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-600">
              Similar Products ({result.similarMatches.length})
            </span>
          </div>
          {result.similarMatches.map((match) => (
            <DuplicateCard
              key={match.assetId}
              match={match}
              productId={productId}
              onDismiss={() => handleDismiss(match)}
              onMark={() => handleMark(match)}
              onMerge={() => handleMerge(match)}
              isActioning={isActioning}
            />
          ))}
        </div>
      )}
    </div>
  );
}
