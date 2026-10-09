'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Copy, Eye, GitMerge, X, AlertTriangle } from 'lucide-react';
import { Badge, toast } from '@patina/design-system';
import { Button } from '@/components/ui/controls';
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

  // A ruled box, never a raised card: zero shadows (D4).
  return (
    <div className="overflow-hidden rounded-sm border border-[var(--doc-ink-border)]">
      <div>
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
      </div>
    </div>
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
  // The check runs as the piece opens; the panel shows only what it finds.
  const { data: result, refetch } = useDuplicateCheck(productId);
  const headingId = useId();
  // Products merged here leave the panel at once: the media service's image
  // match outlives the merge, so its next answer may still name them.
  const [mergedIds, setMergedIds] = useState<string[]>([]);

  const dismissMutation = useDismissDuplicate();
  const markMutation = useMarkAsDuplicate();
  const mergeMutation = useMergeStudioProduct();
  // The kept product's layer and studio decide which matches may merge.
  const { data: keep } = useProduct(productId);

  const isActioning =
    dismissMutation.isPending ||
    markMutation.isPending ||
    mergeMutation.isPending;

  const unmerged = (matches: DuplicateMatch[] | undefined) =>
    (matches ?? []).filter(
      (match) => !match.product || !mergedIds.includes(match.product.id),
    );
  const exactMatches = unmerged(result?.exactMatches);
  const similarMatches = unmerged(result?.similarMatches);
  const totalMatches = exactMatches.length + similarMatches.length;
  const hasExactMatches = exactMatches.length > 0;

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
      setMergedIds((ids) => [...ids, fromProductId]);
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

  // Nothing to show while it checks, when it cannot check, or when it finds
  // no duplicate: the piece reads as it did.
  if (totalMatches === 0) return null;

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="flex items-center gap-2">
        <Copy className="h-4 w-4 text-[var(--color-quiet-ink)]" />
        <h3
          id={headingId}
          className="font-heading text-[1.05rem] text-[var(--color-charcoal)]"
        >
          Possible duplicates
        </h3>
        <span className="doc-type-meta">
          {totalMatches} found{hasExactMatches ? ' · exact' : ''}
        </span>
      </div>

      {/* D11: no hard delete; a duplicate on a line merges instead */}
      <p className="doc-type-body text-[var(--color-quiet-ink)]">
        {REFERENCED_PRODUCT_DELETE_REFUSAL}
      </p>

      {/* Exact matches */}
      {exactMatches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-red-600">
              Exact Matches ({exactMatches.length})
            </span>
          </div>
          {exactMatches.map((match) => (
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
      {similarMatches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-600">
              Similar Products ({similarMatches.length})
            </span>
          </div>
          {similarMatches.map((match) => (
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
    </section>
  );
}
