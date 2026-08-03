'use client';

import type { EditableMoodBoardItem } from '@patina/types';
import { Button } from '@/components/ui/controls';
import {
  useBackgroundRemovalCapability,
  useRemoveBoardItemBackground,
} from '@/hooks/use-background-removal';
import { BackgroundRemovalClientError } from '@/lib/mood-board-assets/background-removal-client';

export interface BoardImagePatch {
  imageUrl?: string | null;
  data?: Record<string, unknown>;
}

function idempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `bg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function originalImageUrl(item: EditableMoodBoardItem): string | null {
  const value = item.data?.original_image_url;
  return typeof value === 'string' && value.trim() ? value : null;
}

function readableError(cause: unknown): string {
  if (cause instanceof BackgroundRemovalClientError && cause.code === 'background_removal_limit_reached') {
    const reset = cause.details?.resetAt;
    return reset
      ? `Background-removal limit reached. It resets ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(reset))}.`
      : 'Background-removal limit reached.';
  }
  return cause instanceof Error ? cause.message : 'The background could not be removed.';
}

/** Inspector actions kept outside the controller; each result enters history as one content command. */
export function BoardImageInspectorActions({
  boardId,
  item,
  onUpdate,
  onRemoved,
  onBlocked,
}: {
  boardId: string;
  item: EditableMoodBoardItem;
  onUpdate: (itemId: string, patch: BoardImagePatch) => void;
  onRemoved?: (durationMs: number) => void;
  onBlocked?: (reason: 'not_configured' | 'budget_exceeded') => void;
}) {
  const capability = useBackgroundRemovalCapability(boardId);
  const removeBackground = useRemoveBoardItemBackground();
  const originalUrl = originalImageUrl(item);
  const eligibleType = item.type === 'image' || item.type === 'capture' || item.type === 'product';
  const canRemove = eligibleType && Boolean(item.imageUrl) && capability.data?.available === true;

  if (originalUrl) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          const nextData = { ...(item.data ?? {}) };
          delete nextData.original_image_url;
          onUpdate(item.id, { imageUrl: originalUrl, data: nextData });
        }}
      >
        Revert background removal
      </Button>
    );
  }

  // Capability absence is intentionally invisible (R3.4.6), including while
  // the silent capability probe is loading or unavailable.
  if (!canRemove) return null;

  const handleRemove = async () => {
    const started = performance.now();
    try {
      const result = await removeBackground.mutateAsync({
        boardId,
        itemId: item.id,
        idempotencyKey: idempotencyKey(),
      });
      onUpdate(item.id, {
        imageUrl: result.cutoutUrl,
        data: {
          ...(item.data ?? {}),
          original_image_url: result.originalUrl,
        },
      });
      onRemoved?.(Math.max(0, Math.round(performance.now() - started)));
    } catch (cause) {
      if (cause instanceof BackgroundRemovalClientError) {
        if (cause.code === 'background_removal_not_configured') onBlocked?.('not_configured');
        if (cause.code === 'background_removal_limit_reached') onBlocked?.('budget_exceeded');
      }
    }
  };

  const mutationError = removeBackground.error;
  return (
    <div className="space-y-1.5">
      <Button
        variant="ghost"
        size="sm"
        disabled={removeBackground.isPending}
        onClick={() => void handleRemove()}
      >
        {removeBackground.isPending ? 'Removing background…' : 'Remove background'}
      </Button>
      {mutationError && (
        <p role="alert" className="text-[11px] leading-4 text-[var(--color-clay)]">
          {readableError(mutationError)}
        </p>
      )}
      {capability.data?.available && (
        <p className="font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--text-muted)]">
          {capability.data.quota.studioMonthly.remaining} studio credits remain this month
        </p>
      )}
    </div>
  );
}
