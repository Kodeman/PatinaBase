'use client';

/**
 * ResolveRfi — the RFI resolve panel (resolveKind 'answer').
 *
 * The designer records the answer; `resolve_coordination_item` (00218) stores
 * it, clears the FF&E/task blocks the RFI gated, and hands the ball to its
 * default next court (gc) in one transaction. The cascade confirmation is the
 * QUIET inline line (R51) — never a toast — then the band closes the sheet.
 */

import { useState } from 'react';
import { useResolveCoordinationItem } from '@patina/supabase';
import {
  ButtonRow,
  Field,
  QuietConfirm,
  ResolveButton,
  ResolveQuestion,
  ResolveShell,
  ResolveTextarea,
  type ResolvePanelProps,
} from '../open-item-sheet';

export function ResolveRfi({
  item,
  projectId,
  onResolved,
}: ResolvePanelProps) {
  const resolve = useResolveCoordinationItem(projectId);
  const [answer, setAnswer] = useState('');
  const [done, setDone] = useState(false);

  const send = () => {
    const text = answer.trim();
    if (!text) return;
    resolve.mutate(
      { itemId: item.id, answer: text },
      {
        onSuccess: () => {
          setDone(true);
          window.setTimeout(onResolved, 900);
        },
      },
    );
  };

  return (
    <ResolveShell>
      <ResolveQuestion>Answer the RFI — your response unblocks the GC.</ResolveQuestion>
      <Field label="Your answer">
        <ResolveTextarea
          autoFocus
          rows={3}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Relocate the pendant 14″, keep the drop…"
          disabled={resolve.isPending || done}
        />
      </Field>
      <ButtonRow>
        <ResolveButton
          tone="gold"
          onClick={send}
          disabled={!answer.trim() || resolve.isPending || done}
        >
          {resolve.isPending ? 'Sending…' : 'Send answer →'}
        </ResolveButton>
        <ResolveButton tone="plain" onClick={onResolved} disabled={resolve.isPending}>
          Later
        </ResolveButton>
      </ButtonRow>
      {done && <QuietConfirm>Answered — the GC is unblocked. Downstream work re-sorts.</QuietConfirm>}
    </ResolveShell>
  );
}
