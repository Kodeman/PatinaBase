'use client';

/**
 * ResolvePunch — the punch-list resolve panel (resolveKind 'verify').
 *
 * A closeout fix: the designer verifies the item is corrected and records it.
 * `resolve_coordination_item({ itemId, answer, nextCourt:'designer' })` (00218,
 * R49) records the verification and keeps the ball with the designer for the
 * final close — the verify step, not a hand-off. Quiet confirmation only (R51).
 *
 * TODO (Slice F, lower priority — punch↔PO/receiving closeout link): there is no
 * clean column joining a punch item to a purchase_order / receiving_inspection
 * today (use-procurement exposes damage_claims↔receiving_inspections, but no
 * coordination_item_id on either, and no PO closeout hook). Deferred rather than
 * over-built: a future additive migration would add
 * client_decisions.purchase_order_id (or a punch↔PO join) so a verified punch can
 * surface the related PO/receiving record here. Not wired in this slice.
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

export function ResolvePunch({ item, projectId, onResolved }: ResolvePanelProps) {
  const resolve = useResolveCoordinationItem(projectId);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);

  const verify = () => {
    resolve.mutate(
      {
        itemId: item.id,
        answer: note.trim() || 'Verified — corrected and closed.',
        // R49: a punch verify keeps the ball with the designer for the close.
        nextCourt: 'designer',
      },
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
      <ResolveQuestion>Verify the fix — confirm the punch item is corrected and close it.</ResolveQuestion>
      <Field label="Verification note (optional)">
        <ResolveTextarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Re-caulked the reveal; reveal now even across the run…"
          disabled={resolve.isPending || done}
        />
      </Field>
      <ButtonRow>
        <ResolveButton tone="sage" onClick={verify} disabled={resolve.isPending || done}>
          {resolve.isPending ? 'Verifying…' : 'Verify & close →'}
        </ResolveButton>
        <ResolveButton tone="plain" onClick={onResolved} disabled={resolve.isPending}>
          Later
        </ResolveButton>
      </ButtonRow>
      {done && <QuietConfirm>Verified — the punch item is closed. Closeout re-reads.</QuietConfirm>}
    </ResolveShell>
  );
}
