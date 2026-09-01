'use client';

import { useMemo, useState } from 'react';
import type { EditableMoodBoardItem } from '@patina/types';
import { usePromoteBoardReferenceToSelection } from '@patina/supabase';
import { Button } from '@/components/ui/controls';

function pinName(item: EditableMoodBoardItem): string {
  const name = item.data?.name;
  if (typeof name === 'string' && name.trim()) return name;
  return item.content?.trim() || 'Board pick';
}

/**
 * DV3 — materializing a studio template onto a project board preserves
 * layout/sections exactly but strips owner links from every product pin
 * (materialize_board_template's designed behavior, AC3.23/3.24). Before this,
 * seeding the same template on N boards meant N manual per-pin "Promote to
 * project selection" clicks (board-room-inspector.tsx). This panel offers a
 * one-shot bulk promote right after materialization (`justMaterialized`,
 * threaded from the `materialized=template` query param BoardsBuilder sets
 * on its post-materialize redirect), and stays reachable later from the room
 * once ≥2 promotable pins remain unpromoted — mirrors the sequential,
 * aggregate-failure-reporting pattern in board-approved-pins-panel.tsx
 * (W2b), but is NOT gated on client approval: every owner-linked
 * product/capture pin missing a `projectFfeItemId` counts, independent of
 * verdict state.
 */
export function BoardPromoteAllPanel({
  projectId,
  scopeRoomId,
  items,
  justMaterialized,
  onDismissJustMaterialized,
  onPromoted,
}: {
  projectId: string;
  scopeRoomId: string | null;
  items: readonly EditableMoodBoardItem[];
  justMaterialized: boolean;
  onDismissJustMaterialized: () => void;
  onPromoted: (itemId: string, selectionId: string) => void;
}) {
  const promote = usePromoteBoardReferenceToSelection();
  const [sendingAll, setSendingAll] = useState(false);
  const [batchResult, setBatchResult] = useState<{
    attempted: number;
    failures: ReadonlyArray<{ id: string; name: string; message: string }>;
  } | null>(null);

  const eligible = useMemo(
    () =>
      items.filter(
        (item) =>
          (item.type === 'product' || item.type === 'capture') && !item.projectFfeItemId,
      ),
    [items],
  );

  // Visible right after materialization for any nonzero count (a first
  // template seed with even one product pin still shouldn't require a
  // separate per-pin click); afterward it stays reachable only once ≥2
  // unpromoted promotable pins remain — a single leftover pin is trivially
  // handled by the inspector's own per-pin action.
  const shouldShow = eligible.length > 0 && (justMaterialized || eligible.length >= 2);
  if (!shouldShow) return null;

  const promoteOne = async (
    item: EditableMoodBoardItem,
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    try {
      const result = await promote.mutateAsync({
        projectId,
        boardItemId: item.id,
        assignmentScope: scopeRoomId ? 'room' : 'unassigned',
        roomId: scopeRoomId,
        disposition: 'candidate',
        duplicateMode: 'reuse',
        idempotencyKey: `promote:${item.id}`,
      });
      if (!result.selectionId) throw new Error('Promotion did not return a selection.');
      onPromoted(item.id, result.selectionId);
      return { ok: true };
    } catch (cause) {
      return {
        ok: false,
        message:
          cause instanceof Error ? cause.message : 'This piece could not be promoted.',
      };
    }
  };

  const sendAll = async () => {
    setBatchResult(null);
    setSendingAll(true);
    // Snapshot up front: onPromoted mutates parent item state as each pin
    // succeeds, which would otherwise shrink `eligible` mid-loop.
    const attempted = eligible;
    const failures: Array<{ id: string; name: string; message: string }> = [];
    try {
      for (const item of attempted) {
        // Sequential on purpose — mirrors board-approved-pins-panel.tsx: each
        // call updates local editor state the next iteration should see, and
        // the idempotency key is per-pin, not batched server-side.
        const outcome = await promoteOne(item);
        if (!outcome.ok) {
          failures.push({ id: item.id, name: pinName(item), message: outcome.message });
        }
      }
    } finally {
      setSendingAll(false);
      setBatchResult({ attempted: attempted.length, failures });
      if (justMaterialized) onDismissJustMaterialized();
    }
  };

  return (
    <div
      role="region"
      aria-label="Promote materialized pieces to the project selection"
      className="relative z-40 shrink-0 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {justMaterialized
            ? `${eligible.length} ${eligible.length === 1 ? 'piece' : 'pieces'} from this template aren't in the project selection yet`
            : `${eligible.length} pieces not yet in the project selection`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={sendingAll || promote.isPending}
            onClick={() => void sendAll()}
          >
            {sendingAll ? 'Promoting…' : `Promote all ${eligible.length} pieces`}
          </Button>
          {justMaterialized && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={onDismissJustMaterialized}
              className="min-h-8 min-w-8 font-mono text-[9px] uppercase text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
      {batchResult && batchResult.failures.length > 0 && (
        <p role="alert" className="mt-2 text-[11px] text-[var(--color-clay-ink)]">
          {batchResult.failures.length} of {batchResult.attempted} could not be promoted:{' '}
          {batchResult.failures.map((failure) => failure.name).join(', ')}
        </p>
      )}
    </div>
  );
}
