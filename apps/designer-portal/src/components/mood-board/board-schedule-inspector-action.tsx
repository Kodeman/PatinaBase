'use client';

import { useState } from 'react';
import type { EditableMoodBoardItem } from '@patina/types';
import { useAddProposalItem, useProposalScheduleItems } from '@patina/supabase';
import { Button } from '@/components/ui/controls';
import {
  buildSendToScheduleArgs,
  findExistingScheduleLine,
  type PinScheduleSnapshot,
} from '@/lib/scope/board-schedule';

const nonBlankString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

export function scheduleSnapshotForBoardItem(item: EditableMoodBoardItem): PinScheduleSnapshot {
  const priceCents = item.data?.price_cents;
  const dataImageUrl = item.data?.image_url;
  return {
    type: item.type,
    productId: item.productId ?? null,
    name: nonBlankString(item.data?.name),
    imageUrl: item.imageUrl ?? (typeof dataImageUrl === 'string' ? dataImageUrl : null),
    priceCents: typeof priceCents === 'number' ? priceCents : null,
    vendorId: nonBlankString(item.data?.vendor_id),
    vendorName: nonBlankString(item.data?.vendor_name),
    sourceUrl: nonBlankString(item.data?.source_url),
    proposalItemId: nonBlankString(item.data?.proposalItemId),
  };
}

/** Proposal-only inspector action. Project boards intentionally never mount it. */
export function BoardScheduleInspectorAction({
  proposalId,
  scopeRoomId,
  item,
  onSent,
}: {
  proposalId: string;
  scopeRoomId: string | null;
  item: EditableMoodBoardItem;
  /** Stamps the new line's id on the pin (data.proposalItemId) through the room's command path. */
  onSent?: (itemId: string, proposalItemId: string) => void;
}) {
  const schedule = useProposalScheduleItems(proposalId);
  const addItem = useAddProposalItem();
  const [status, setStatus] = useState<null | { kind: 'added' | 'exists'; docCode: string | null }>(null);
  const [error, setError] = useState<string | null>(null);
  const snapshot = scheduleSnapshotForBoardItem(item);
  const lines = schedule.data ?? [];
  const twin = findExistingScheduleLine(lines, snapshot, scopeRoomId);

  if (status) {
    return (
      <p className="text-[11px] text-[var(--text-muted)]" role="status">
        {status.kind === 'added' ? 'Added to the schedule' : 'Already on the schedule'}
        {status.docCode ? ` · ${status.docCode}` : ''}
      </p>
    );
  }

  const send = async () => {
    setError(null);
    if (twin) {
      setStatus({ kind: 'exists', docCode: twin.doc_code });
      return;
    }
    try {
      const args = buildSendToScheduleArgs({
        proposalId,
        snap: snapshot,
        boardScopeRoomId: scopeRoomId,
        existingCodes: lines.map((line) => line.doc_code),
      });
      const line = await addItem.mutateAsync(args);
      if (typeof line?.id === 'string') onSent?.(item.id, line.id);
      setStatus({ kind: 'added', docCode: args.docCode });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add this pin to the schedule.');
    }
  };

  return (
    <div className="space-y-1.5">
      <Button
        variant="ghost"
        size="sm"
        disabled={schedule.isLoading || addItem.isPending}
        onClick={() => void send()}
      >
        {addItem.isPending
          ? 'Sending…'
          : twin
            ? 'Already on the schedule'
            : 'Send to the schedule'}
      </Button>
      {schedule.isError && (
        <p className="text-[11px] text-[var(--color-clay-ink)]" role="alert">
          The schedule is unavailable. Try again in a moment.
        </p>
      )}
      {error && <p className="text-[11px] text-[var(--color-clay-ink)]" role="alert">{error}</p>}
    </div>
  );
}
