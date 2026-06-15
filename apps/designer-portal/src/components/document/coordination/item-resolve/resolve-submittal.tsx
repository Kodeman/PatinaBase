'use client';

/**
 * ResolveSubmittal — the submittal resolve panel (resolveKind 'approve').
 *
 * Two acts (R48):
 *   · Approve → `resolve_coordination_item({ itemId, revisionId })` (00218)
 *     approves the latest revision, releases fabrication, hands the ball back.
 *   · Revise & resubmit → `submit_coordination_revision` (RPC-ONLY, 00214)
 *     adds the next Rev row with status revise_resubmit; the item stays pending
 *     and fabrication stays held. The Rev-N history reads from useItemRevisions.
 *
 * Quiet confirmation only (R51). Submittal revisions are RPC-backed — never a
 * direct insert.
 */

import { useState } from 'react';
import {
  useResolveCoordinationItem,
  useSubmitCoordinationRevision,
  useItemRevisions,
} from '@patina/supabase';
import { fmtDay } from '@/lib/document/format';
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

const REV_STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  revise_resubmit: 'Revise & resubmit',
};

export function ResolveSubmittal({ item, projectId, onResolved }: ResolvePanelProps) {
  const { data: revisions } = useItemRevisions(item.id);
  const resolve = useResolveCoordinationItem(projectId);
  const revise = useSubmitCoordinationRevision(projectId);

  const [revising, setRevising] = useState(false);
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);

  const latestRev = revisions?.[0] ?? null;
  const busy = resolve.isPending || revise.isPending;

  const approve = () => {
    resolve.mutate(
      { itemId: item.id, revisionId: latestRev?.id ?? null },
      {
        onSuccess: () => {
          setConfirm('Approved — millwork released to the shop. The vendor is unblocked.');
          window.setTimeout(onResolved, 900);
        },
      },
    );
  };

  const sendBack = () => {
    revise.mutate(
      { itemId: item.id, note: note.trim() || null, status: 'revise_resubmit' },
      {
        onSuccess: (rev) => {
          setConfirm(
            `Sent back — Rev ${rev.rev_number} requested. Fabrication stays held until it returns.`,
          );
          setRevising(false);
          setNote('');
        },
      },
    );
  };

  return (
    <ResolveShell>
      {/* Rev-N history (R48) */}
      {revisions && revisions.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 font-mono text-[0.46rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
            Revision history
          </div>
          <ul>
            {revisions.map((r) => (
              <li
                key={r.id}
                className="flex items-baseline gap-2 border-b border-dashed border-[var(--color-pearl)] py-1 text-[0.72rem] text-[var(--color-mocha)] last:border-b-0"
              >
                <span className="font-mono text-[0.6rem] font-semibold text-[var(--color-charcoal)]">
                  Rev {r.rev_number}
                </span>
                <span className="font-mono text-[0.46rem] uppercase tracking-[0.04em] text-[var(--text-muted)]">
                  {REV_STATUS_LABEL[r.status] ?? r.status}
                </span>
                {r.note && <span className="min-w-0 flex-1 truncate italic">“{r.note}”</span>}
                <span className="ml-auto whitespace-nowrap font-mono text-[0.46rem] text-[var(--text-muted)]">
                  {fmtDay(r.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ResolveQuestion>
        Review the submittal — your action releases (or holds) fabrication.
      </ResolveQuestion>

      {revising ? (
        <>
          <Field label="What needs to change">
            <ResolveTextarea
              autoFocus
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Correct the toe-kick height, tighten the reveal to 1/4″…"
              disabled={busy}
            />
          </Field>
          <ButtonRow>
            <ResolveButton tone="gold" onClick={sendBack} disabled={busy}>
              {revise.isPending ? 'Sending…' : 'Send back — revise & resubmit'}
            </ResolveButton>
            <ResolveButton tone="plain" onClick={() => setRevising(false)} disabled={busy}>
              Cancel
            </ResolveButton>
          </ButtonRow>
        </>
      ) : (
        <ButtonRow>
          <ResolveButton tone="sage" onClick={approve} disabled={busy}>
            {resolve.isPending ? 'Approving…' : 'Approve'}
          </ResolveButton>
          <ResolveButton tone="plain" onClick={() => setRevising(true)} disabled={busy}>
            Revise & resubmit
          </ResolveButton>
        </ButtonRow>
      )}

      {confirm && <QuietConfirm>{confirm}</QuietConfirm>}
    </ResolveShell>
  );
}
