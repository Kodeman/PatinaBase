'use client';

/**
 * ResolveSignoff — the sign-off gate resolve panel (resolveKind 'sign').
 *
 * A sign-off settles a phase: the client approves in their mirror, and the
 * designer can record that approval here (R49 — the designer-side record path).
 * `resolve_coordination_item` (00218) records it, advances the phase, and hands
 * the ball back in one transaction (§5). When the gate carries options (an
 * Approve / Request-changes pair), the approving option is recorded as the
 * selected one; otherwise the approval is recorded as a note. A nudge re-knocks
 * the client without resolving. Quiet confirmation only (R51).
 */

import { useState } from 'react';
import {
  useResolveCoordinationItem,
  useNudgeCoordinationItem,
} from '@patina/supabase';
import {
  ButtonRow,
  QuietConfirm,
  ResolveButton,
  ResolveQuestion,
  ResolveShell,
  type ResolvePanelProps,
} from '../open-item-sheet';

export function ResolveSignoff({
  item,
  projectId,
  onResolved,
  clientName,
}: ResolvePanelProps & { clientName?: string }) {
  const resolve = useResolveCoordinationItem(projectId);
  const nudge = useNudgeCoordinationItem(projectId);
  const [confirm, setConfirm] = useState<string | null>(null);

  // A sign-off may carry an Approve / Request-changes option pair (like a gate);
  // record the approving option when present, else record a plain approval note.
  const approvingOption = (item.options ?? []).find(
    (o) => o.is_recommended || o.name?.toLowerCase().includes('approve'),
  );
  const who = clientName ?? 'the client';
  const busy = resolve.isPending || nudge.isPending;

  const recordApproval = () => {
    resolve.mutate(
      approvingOption
        ? { itemId: item.id, selectedOptionId: approvingOption.id }
        : {
            itemId: item.id,
            answer: `Signed off by ${who} — the phase can advance.`,
          },
      {
        onSuccess: () => {
          setConfirm(
            'Signed off — the phase advances. The Strata Mark and the margin re-read.',
          );
          window.setTimeout(onResolved, 900);
        },
      },
    );
  };

  const sendNudge = () => {
    nudge.mutate(
      { itemId: item.id },
      {
        onSuccess: () => {
          setConfirm(
            `Nudge sent to ${who}. Logged on the item — nothing ages in the dark.`,
          );
          window.setTimeout(onResolved, 900);
        },
      },
    );
  };

  return (
    <ResolveShell>
      <ResolveQuestion>
        The sign-off gate — {who} approves in their mirror. Record it when they
        do.
      </ResolveQuestion>
      <ButtonRow>
        <ResolveButton
          actionKey="record-signoff-approval"
          tone="gold"
          onClick={recordApproval}
          disabled={busy}
        >
          {resolve.isPending ? 'Recording…' : 'Record their approval →'}
        </ResolveButton>
        <ResolveButton
          actionKey="nudge-signoff"
          tone="plain"
          onClick={sendNudge}
          disabled={busy}
        >
          {nudge.isPending ? 'Nudging…' : 'Nudge them'}
        </ResolveButton>
      </ButtonRow>
      {confirm && <QuietConfirm>{confirm}</QuietConfirm>}
    </ResolveShell>
  );
}
