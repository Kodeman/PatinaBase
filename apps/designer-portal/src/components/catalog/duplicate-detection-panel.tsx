'use client';

import { useEffect, useRef, useState } from 'react';
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
  Card,
  CardContent,
  Skeleton,
  toast,
} from '@patina/design-system';
import { Button, IconButton } from '@/components/ui/controls';
import {
  useDuplicateCheck,
  useDismissDuplicate,
  useMarkAsDuplicate,
  useMergeStudioProduct,
  useProduct,
} from '@patina/supabase/hooks';
import type { DuplicateMatch } from '@patina/supabase/hooks';
import { REFERENCED_PRODUCT_DELETE_REFUSAL } from '@/hooks/use-products';

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

/** The products columns merge_studio_product (00753) reads to refuse a merge. */
interface MergeFacts {
  layer?: string | null;
  studio_id?: string | null;
  merged_into_id?: string | null;
  deleted_at?: string | null;
}

/**
 * Whether merge_studio_product would take this pair (00753:131-157): both
 * studio-layer products of one studio, neither merged nor removed. Studio
 * membership is the server's to check. Unknown facts offer nothing.
 */
function serverMergeAllows(
  keep: MergeFacts | null | undefined,
  from: MergeFacts | null | undefined,
): boolean {
  if (!keep || !from) return false;
  return (
    keep.layer === 'studio' &&
    from.layer === 'studio' &&
    keep.studio_id != null &&
    keep.studio_id === from.studio_id &&
    keep.merged_into_id == null &&
    keep.deleted_at == null &&
    from.merged_into_id == null &&
    from.deleted_at == null
  );
}

interface MergeActProps {
  fromId: string;
  fromName: string;
  keep: MergeFacts | null | undefined;
  keepName: string;
  onConfirm: () => void;
  isActioning: boolean;
}

/**
 * MERGE INTO THIS ONE, offered only where the server allows the merge, and
 * asked first in the page: the merge cannot be undone (US-21 T-55b, F10).
 */
function MergeAct({
  fromId,
  fromName,
  keep,
  keepName,
  onConfirm,
  isActioning,
}: MergeActProps) {
  const { data: from } = useProduct(fromId);
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  // Focus goes to the safe act when the question opens, and back to
  // MERGE INTO THIS ONE when it closes without merging.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (wasConfirming.current) openRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  if (!serverMergeAllows(keep, from as MergeFacts | null | undefined)) return null;

  if (!confirming) {
    return (
      <Button
        ref={openRef}
        size="sm"
        variant="secondary"
        onClick={() => setConfirming(true)}
        disabled={isActioning}
        className="text-xs"
      >
        <GitMerge className="mr-1 h-3 w-3" />
        MERGE INTO THIS ONE
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Confirm the merge"
      className="w-full space-y-2 rounded-sm border border-[var(--border-default)] p-3"
    >
      <p className="text-sm">
        {`Merge “${fromName}” into “${keepName}”? Its lines, boards and project lists move to “${keepName}”. The merge cannot be undone.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
          disabled={isActioning}
          className="text-xs"
        >
          MERGE
        </Button>
        <Button
          ref={cancelRef}
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(false)}
          className="text-xs"
        >
          KEEP BOTH
        </Button>
      </div>
    </div>
  );
}

interface DuplicateCardProps {
  match: DuplicateMatch;
  onDismiss: () => void;
  onMark: () => void;
  /** Absent when the match is not another catalog product (merge needs one). */
  merge?: Omit<MergeActProps, 'isActioning'>;
  isActioning: boolean;
}

function DuplicateCard({
  match,
  onDismiss,
  onMark,
  merge,
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
                variant="secondary"
                onClick={onMark}
                disabled={isActioning}
                className="text-xs"
              >
                <AlertTriangle className="mr-1 h-3 w-3" />
                Mark Duplicate
              </Button>
              {merge && <MergeAct {...merge} isActioning={isActioning} />}
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
  const mergeMutation = useMergeStudioProduct();
  // The kept product's layer and studio decide which matches may merge.
  const { data: keep } = useProduct(isExpanded ? productId : '');

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
        variant: 'error',
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
        variant: 'error',
      });
    }
  };

  // D11 (00753): the duplicate merges into the product this panel is on. Its
  // lines, boards and project lists move here; it is never hard deleted.
  const mergeHandler = (
    match: DuplicateMatch,
  ): DuplicateCardProps['merge'] => {
    const fromProductId = match.product?.id;
    if (!fromProductId || fromProductId === productId) return undefined;
    return {
      fromId: fromProductId,
      fromName: match.product?.name || 'the duplicate',
      keep: keep as MergeFacts | null | undefined,
      keepName: productName || keep?.name || 'this product',
      onConfirm: () => void runMerge(fromProductId),
    };
  };

  const runMerge = async (fromProductId: string) => {
    try {
      await mergeMutation.mutateAsync({ fromProductId, intoProductId: productId });
      toast({
        title: 'Merged',
        description: 'The duplicate now points here, and its lines use this product.',
      });
      refetch();
      onActionComplete?.();
    } catch (err) {
      // merge_studio_product refuses in plain sentences; print them as-is.
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : '';
      toast({
        title: "The merge didn't go through",
        description: message || 'Try again.',
        variant: 'error',
      });
    }
  };

  // Collapsed state - just show a button
  if (!isExpanded) {
    return (
      <Button
        variant="secondary"
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
          <IconButton
            size="sm"
            variant="ghost"
            label="Refresh duplicate check"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </IconButton>
          <IconButton
            size="sm"
            variant="ghost"
            label="Close duplicate detection"
            onClick={() => setIsExpanded(false)}
          >
            <X className="h-4 w-4" />
          </IconButton>
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

      {/* D11: no hard delete; a duplicate on a line merges instead */}
      {result && totalMatches > 0 && (
        <p className="text-sm text-muted-foreground">{REFERENCED_PRODUCT_DELETE_REFUSAL}</p>
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
              onDismiss={() => handleDismiss(match)}
              onMark={() => handleMark(match)}
              merge={mergeHandler(match)}
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
              onDismiss={() => handleDismiss(match)}
              onMark={() => handleMark(match)}
              merge={mergeHandler(match)}
              isActioning={isActioning}
            />
          ))}
        </div>
      )}
    </div>
  );
}
