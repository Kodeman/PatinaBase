'use client';

/**
 * ResolveWaiting — the panel for an item in someone else's court (court !=
 * designer) that's theirs to move (an RFI/submittal/punch waiting on a
 * GC/vendor). The designer can't resolve it — they keep it moving:
 *   · Nudge   → useNudgeCoordinationItem (re-knocks, logs the reminder)
 *   · Extend  → useExtendCoordinationItem (pushes the due date out)
 *   · Reassign→ useReassignCoordinationItem (moves the ball to another court —
 *               the accountability primitive)
 *
 * Reassign offers the four courts (+ the project's concrete GC/vendor parties).
 * Nothing resolves here; only whose move it is / when it's due changes. Quiet
 * confirmation only (R51) — never a toast.
 */

import { useState } from 'react';
import {
  useNudgeCoordinationItem,
  useExtendCoordinationItem,
  useReassignCoordinationItem,
  type Court,
  type ProjectParty,
} from '@patina/supabase';
import { COURT_ORDER } from '@/lib/document/coordination-derivation';
import { partyFor, courtToken } from '../party';
import { todayYmd } from '@/lib/document/format';
import {
  ButtonRow,
  Field,
  QuietConfirm,
  ResolveButton,
  ResolveInput,
  ResolveQuestion,
  ResolveShell,
  type ResolvePanelProps,
} from '../open-item-sheet';

export function ResolveWaiting({
  item,
  projectId,
  onResolved,
  parties = [],
  clientName,
}: ResolvePanelProps & { parties?: ProjectParty[]; clientName?: string }) {
  const nudge = useNudgeCoordinationItem(projectId);
  const extend = useExtendCoordinationItem(projectId);
  const reassign = useReassignCoordinationItem(projectId);

  const [mode, setMode] = useState<'idle' | 'extend' | 'reassign'>('idle');
  const [newDue, setNewDue] = useState(item.due_date ?? todayYmd());
  const [confirm, setConfirm] = useState<string | null>(null);

  const tok = partyFor(item.court, {
    party:
      item.court_party ??
      (item.court_party_id
        ? (parties.find((p) => p.id === item.court_party_id) ?? null)
        : null),
    clientName,
  });
  const busy = nudge.isPending || extend.isPending || reassign.isPending;

  const close = () => window.setTimeout(onResolved, 900);

  const sendNudge = () =>
    nudge.mutate(
      { itemId: item.id },
      {
        onSuccess: () => {
          setConfirm(
            `Nudge sent to ${tok.label}. Logged on the item — nothing ages in the dark.`,
          );
          close();
        },
      },
    );

  const sendExtend = () =>
    extend.mutate(
      {
        itemId: item.id,
        dueDate: newDue || null,
        expectedUpdatedAt: item.updated_at,
      },
      {
        onSuccess: () => {
          setConfirm('Date extended. The item and the margin update together.');
          setMode('idle');
        },
      },
    );

  const doReassign = (court: Court, partyId: string | null) =>
    reassign.mutate(
      {
        itemId: item.id,
        court,
        courtPartyId: partyId,
        expectedUpdatedAt: item.updated_at,
      },
      {
        onSuccess: () => {
          setConfirm(
            'Reassigned — the ball moves to another court. Accountability follows the ball.',
          );
          close();
        },
      },
    );

  // Reassign targets: the four courts, plus each concrete GC/vendor party as a
  // distinct target that also sets the court_party_id.
  const courtTargets = COURT_ORDER.filter((c) => c !== item.court).map((c) => ({
    court: c,
    partyId: null as string | null,
    label: courtToken(c).label,
  }));
  const partyTargets = parties.map((p) => ({
    court: (p.party_kind === 'vendor'
      ? 'vendor'
      : p.party_kind === 'gc'
        ? 'gc'
        : 'client') as Court,
    partyId: p.id,
    label: p.display_name || p.company_name || 'Party',
  }));

  return (
    <ResolveShell>
      {mode === 'idle' && (
        <>
          <ResolveQuestion>
            Waiting on {tok.label}. Keep it moving:
          </ResolveQuestion>
          <ButtonRow>
            <ResolveButton
              actionKey="nudge-waiting-item"
              tone="gold"
              onClick={sendNudge}
              disabled={busy}
            >
              {nudge.isPending ? 'Nudging…' : 'Send a nudge'}
            </ResolveButton>
            <ResolveButton
              actionKey="open-waiting-date-extension"
              tone="plain"
              onClick={() => setMode('extend')}
              disabled={busy}
            >
              Extend the date
            </ResolveButton>
            <ResolveButton
              actionKey="open-waiting-court-change"
              tone="plain"
              onClick={() => setMode('reassign')}
              disabled={busy}
            >
              Change whose court
            </ResolveButton>
          </ButtonRow>
        </>
      )}

      {mode === 'extend' && (
        <>
          <ResolveQuestion>Push the due date out:</ResolveQuestion>
          <Field label="New due date">
            <ResolveInput
              type="date"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              disabled={busy}
            />
          </Field>
          <ButtonRow>
            <ResolveButton
              actionKey="extend-waiting-date"
              tone="gold"
              onClick={sendExtend}
              disabled={busy}
            >
              {extend.isPending ? 'Saving…' : 'Extend →'}
            </ResolveButton>
            <ResolveButton
              actionKey="cancel-waiting-date-extension"
              tone="plain"
              variant="tertiary"
              onClick={() => setMode('idle')}
              disabled={busy}
            >
              Cancel
            </ResolveButton>
          </ButtonRow>
        </>
      )}

      {mode === 'reassign' && (
        <>
          <ResolveQuestion>Move the ball to another court:</ResolveQuestion>
          <ButtonRow>
            {[...courtTargets, ...partyTargets].map((t) => (
              <ResolveButton
                key={`${t.court}:${t.partyId ?? 'court'}`}
                actionKey="reassign-waiting-item"
                tone="plain"
                onClick={() => doReassign(t.court, t.partyId)}
                disabled={busy}
              >
                {t.label}
              </ResolveButton>
            ))}
            <ResolveButton
              actionKey="cancel-waiting-court-change"
              tone="plain"
              variant="tertiary"
              onClick={() => setMode('idle')}
              disabled={busy}
            >
              Cancel
            </ResolveButton>
          </ButtonRow>
        </>
      )}

      {confirm && <QuietConfirm>{confirm}</QuietConfirm>}
    </ResolveShell>
  );
}
