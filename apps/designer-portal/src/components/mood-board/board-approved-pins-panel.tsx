'use client';

import { useMemo, useState } from 'react';
import type { EditableMoodBoardItem } from '@patina/types';
import {
  useBoardItemFeedbackByBoard,
  usePromoteBoardReferenceToSelection,
  deriveApprovedBoardItemIds,
} from '@patina/supabase';
import { Button } from '@/components/ui/controls';

interface ApprovedPin {
  item: EditableMoodBoardItem;
  scheduled: boolean;
}

function pinName(item: EditableMoodBoardItem): string {
  const name = item.data?.name;
  if (typeof name === 'string' && name.trim()) return name;
  return item.content?.trim() || 'Board pick';
}

/**
 * The "approved pieces -> purchase pipeline" moment (board-paths W2b #2 /
 * synthesis Path B core; validates Marisol M5) for a PROJECT-owned board.
 *
 * There is no proposal-side "send to schedule" for a project board —
 * board-schedule-inspector-action.tsx is explicitly proposal-only ("Project
 * boards intentionally never mount it", useAddProposalItem takes a
 * proposalId project boards don't have). The project-side equivalent
 * purchase-pipeline entry is `promote_board_reference_to_selection`
 * (usePromoteBoardReferenceToSelection) — the SAME mutation the per-pin
 * inspector's existing "Promote to project selection" button already calls
 * (board-room-inspector.tsx). This panel is a bulk, visible front door onto
 * that existing mutation for pins a client has already approved — it does not
 * reimplement or add a new write path.
 */
export function BoardApprovedPinsPanel({
  boardId,
  projectId,
  scopeRoomId,
  items,
  onPromoted,
}: {
  boardId: string;
  projectId: string;
  scopeRoomId: string | null;
  items: readonly EditableMoodBoardItem[];
  onPromoted: (itemId: string, selectionId: string) => void;
}) {
  const feedbackQuery = useBoardItemFeedbackByBoard(boardId);
  const promote = usePromoteBoardReferenceToSelection();
  const [error, setError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [batchResult, setBatchResult] = useState<{
    attempted: number;
    failures: ReadonlyArray<{ id: string; name: string; message: string }>;
  } | null>(null);

  const approvedIds = useMemo(
    () => deriveApprovedBoardItemIds(feedbackQuery.data ?? []),
    [feedbackQuery.data],
  );

  const approvedPins = useMemo<ApprovedPin[]>(
    () =>
      items
        .filter(
          (item) =>
            approvedIds.has(item.id) && (item.type === 'product' || item.type === 'capture'),
        )
        .map((item) => ({ item, scheduled: Boolean(item.projectFfeItemId) })),
    [items, approvedIds],
  );

  if (approvedPins.length === 0) return null;

  const eligible = approvedPins.filter((pin) => !pin.scheduled);

  /** The bare network call + local state update, with no shared-error side
   * effects — both sendOne and sendAll build their own error presentation on
   * top of this so a batch's per-item outcomes never clobber each other. */
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
        message: cause instanceof Error ? cause.message : 'This pin could not be sent to the schedule.',
      };
    }
  };

  const sendOne = async (item: EditableMoodBoardItem) => {
    setError(null);
    setSendingId(item.id);
    try {
      const outcome = await promoteOne(item);
      if (!outcome.ok) setError(outcome.message);
    } finally {
      setSendingId(null);
    }
  };

  const sendAll = async () => {
    setError(null);
    // Cleared only here, at the start of a new batch — a per-item failure
    // accumulated below must survive every later item's success in the same
    // batch, and must keep showing until the NEXT "Send all approved" run.
    setBatchResult(null);
    setSendingAll(true);
    // Snapshot the attempt list up front: onPromoted mutates the parent's
    // item state as each pin succeeds, which would otherwise shrink
    // `eligible` mid-loop and corrupt both the iteration and the final
    // "N of M" count.
    const attempted = eligible;
    const failures: Array<{ id: string; name: string; message: string }> = [];
    try {
      for (const pin of attempted) {
        // Sequential on purpose: each call updates local editor state
        // (onPromoted) that the next iteration's render should already see,
        // and the twin/idempotency key is per-pin, not batched server-side.
        setSendingId(pin.item.id);
        const outcome = await promoteOne(pin.item);
        if (!outcome.ok) {
          failures.push({ id: pin.item.id, name: pinName(pin.item), message: outcome.message });
        }
      }
    } finally {
      setSendingId(null);
      setSendingAll(false);
      setBatchResult({ attempted: attempted.length, failures });
    }
  };

  return (
    <div
      role="region"
      aria-label="Approved pieces awaiting the purchase pipeline"
      className="relative z-40 shrink-0 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {approvedPins.length} approved {approvedPins.length === 1 ? 'piece' : 'pieces'}
          {eligible.length > 0
            ? ` · ${eligible.length} not yet on the schedule`
            : ' · all on the schedule'}
        </p>
        {eligible.length > 1 && (
          <Button
            variant="secondary"
            size="sm"
            disabled={sendingAll || promote.isPending}
            onClick={() => void sendAll()}
          >
            {sendingAll ? 'Sending…' : `Send all approved (${eligible.length})`}
          </Button>
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {approvedPins.map(({ item, scheduled }) => (
          <li
            key={item.id}
            className="flex items-center gap-2 rounded-[4px] border border-[var(--border-default)] px-2 py-1.5"
          >
            <span className="max-w-[160px] truncate font-heading text-[12px] text-[var(--text-primary)]">
              {pinName(item)}
            </span>
            {scheduled ? (
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-sage)]">
                On schedule
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={sendingId === item.id || sendingAll}
                onClick={() => void sendOne(item)}
              >
                {sendingId === item.id ? 'Sending…' : 'Send to schedule'}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-[11px] text-[var(--color-clay-ink)]">
          {error}
        </p>
      )}
      {batchResult && batchResult.failures.length > 0 && (
        <p role="alert" className="mt-2 text-[11px] text-[var(--color-clay-ink)]">
          {batchResult.failures.length} of {batchResult.attempted} could not be sent:{' '}
          {batchResult.failures.map((failure) => failure.name).join(', ')}
        </p>
      )}
    </div>
  );
}
