'use client';

import type { EditableMoodBoardItem } from '@patina/types';
import { createBrowserClient, signBoardMediaValue } from '@patina/supabase';
import { Button } from '@/components/ui/controls';
import {
  useBackgroundRemovalCapability,
  useRemoveBoardItemBackground,
} from '@/hooks/use-background-removal';
import {
  backgroundRemovalIdempotencyKey,
  BackgroundRemovalClientError,
} from '@/lib/mood-board-assets/background-removal-client';
import { moodBoardEvents } from '@/lib/analytics/mood-board-events';

export interface BoardImagePatch {
  imageUrl?: string | null;
  data?: Record<string, unknown>;
}

function originalImageUrl(item: EditableMoodBoardItem): string | null {
  const value = item.data?.original_image_url;
  return typeof value === 'string' && value.trim() ? value : null;
}

function readableError(cause: unknown): string {
  if (cause instanceof BackgroundRemovalClientError && cause.code === 'background_removal_limit_reached') {
    const limit = cause.details?.limit;
    const scope = cause.details?.scope;
    const cap = typeof limit === 'number'
      ? scope === 'studio_monthly'
        ? `${limit} per studio/month`
        : scope === 'global_daily'
          ? `${limit} globally/day`
          : `cap ${limit}`
      : null;
    const reset = cause.details?.resetAt;
    const resetDate = reset ? new Date(reset) : null;
    const formattedReset = resetDate && Number.isFinite(resetDate.getTime())
      ? new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }).format(resetDate)
      : null;
    return [
      `Background-removal limit reached${cap ? ` (${cap})` : ''}.`,
      formattedReset ? `It resets ${formattedReset}.` : null,
    ].filter(Boolean).join(' ');
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
  const eligibleType = item.type === 'image' || item.type === 'capture' || item.type === 'product';
  const capability = useBackgroundRemovalCapability(eligibleType && item.imageUrl ? boardId : null);
  const removeBackground = useRemoveBoardItemBackground();
  const originalUrl = originalImageUrl(item);
  const canRemove = eligibleType && Boolean(item.imageUrl) && capability.data?.available === true;

  if (originalUrl) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          const nextData = { ...(item.data ?? {}) };
          delete nextData.original_image_url;
          nextData.image_url = originalUrl;
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
      if (!item.imageUrl) return;
      const result = await removeBackground.mutateAsync({
        boardId,
        itemId: item.id,
        idempotencyKey: await backgroundRemovalIdempotencyKey({
          boardId,
          itemId: item.id,
          sourceUrl: item.imageUrl,
        }),
      });
      const signed = await signBoardMediaValue(createBrowserClient(), {
        image_url: result.cutoutUrl,
        original_image_url: result.originalUrl,
      });
      onUpdate(item.id, {
        imageUrl: signed.image_url,
        data: {
          ...(item.data ?? {}),
          image_url: signed.image_url,
          original_image_url: signed.original_image_url,
        },
      });
      const durationMs = Math.max(0, Math.round(performance.now() - started));
      moodBoardEvents.backgroundRemoved({
        board_id: boardId,
        board_item_id: item.id,
        item_type: item.type,
        duration_ms: durationMs,
      });
      onRemoved?.(durationMs);
    } catch (cause) {
      if (cause instanceof BackgroundRemovalClientError) {
        if (cause.code === 'background_removal_not_configured') {
          moodBoardEvents.backgroundRemovalBlocked({ reason: 'not_configured', board_id: boardId });
          onBlocked?.('not_configured');
        }
        if (cause.code === 'background_removal_limit_reached') {
          moodBoardEvents.backgroundRemovalBlocked({ reason: 'budget_exceeded', board_id: boardId });
          onBlocked?.('budget_exceeded');
        }
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
