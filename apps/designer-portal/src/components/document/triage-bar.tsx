'use client';

/**
 * Triage bar (Track 6 · ruling R61) — the lead-intake act that was missing.
 *
 * A captured lead already surfaces as a Brief folder (`document_state` Shape C,
 * `new_lead` need). This is the inline affordance that lets the designer act on
 * it without leaving the Desk (the `desk` variant, inside the folder card) or
 * from inside the open Brief document (the `brief` variant).
 *
 * The three verbs map 1:1 onto the prototype's triage block (G1):
 *   · Accept · begin → `useBeginDiscovery`  — lead 'accepted' + relationship
 *     'lead' → the folder flips Brief (Shape C) → Discovery (Shape D),
 *     "Schedule the discovery call". (NOT `useAcceptLead`, which jumps to
 *     'active' and is invisible in `document_state` — verified, R61.)
 *   · Nurture     → `useUpdateLeadStatus('contacted')` — leaves the needs-hand
 *     band (desk-derivation R61 gate) and lives in People's nurture queue.
 *   · Pass        → `useDeclineLead` — drops Shape C, stays in People declined.
 *
 * One-act-many-surfaces (spec §5): each action's own onSuccess invalidates the
 * Desk query key `['document-state','desk']` (use-desk-engagements.ts) AND
 * `['leads']`, so the folder re-derives/flips without a reload. The mutation
 * hooks already invalidate `['leads']`/`['designer-clients']`; the desk key
 * lives in the app, so it's added here at the call site.
 *
 * D4: zero shadows — flat hairline-bordered buttons. D1: no navigation/reset
 * side effect; on the Desk the buttons `stopPropagation` so they never trip the
 * card's pick-up link.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useBeginDiscovery, useUpdateLeadStatus, useDeclineLead } from '@patina/supabase';

type Variant = 'desk' | 'brief';

const BASE_BTN =
  'flex-1 rounded-[2px] border bg-transparent px-0 py-[7px] text-center font-mono text-[10.5px] tracking-[0.04em] transition-colors disabled:cursor-default disabled:opacity-45';

export function TriageBar({
  leadId,
  variant = 'desk',
}: {
  leadId: string;
  variant?: Variant;
}) {
  const qc = useQueryClient();
  const beginDiscovery = useBeginDiscovery();
  const updateStatus = useUpdateLeadStatus();
  const decline = useDeclineLead();

  const busy = beginDiscovery.isPending || updateStatus.isPending || decline.isPending;

  // One-act-many-surfaces: the Desk re-derives without a reload (the mutation
  // hooks own ['leads']/['designer-clients']; the desk key is added here).
  const refreshDesk = () => {
    void qc.invalidateQueries({ queryKey: ['document-state', 'desk'] });
    void qc.invalidateQueries({ queryKey: ['leads'] });
  };

  // On the Desk this bar lives inside the card's pick-up <Link>; the buttons
  // must never navigate (D1). In the open Brief there's nothing to stop.
  const guard = (fn: () => void) => (e: React.MouseEvent) => {
    if (variant === 'desk') {
      e.preventDefault();
      e.stopPropagation();
    }
    fn();
  };

  const onAccept = () => beginDiscovery.mutate(leadId, { onSuccess: refreshDesk });
  const onNurture = () =>
    updateStatus.mutate({ leadId, status: 'contacted' }, { onSuccess: refreshDesk });
  const onPass = () => decline.mutate({ leadId }, { onSuccess: refreshDesk });

  const wrapClass =
    variant === 'desk'
      ? 'mt-3.5 flex gap-2 border-t border-[var(--color-pearl)] pt-3'
      : 'mt-4 flex gap-2 border-t border-[var(--color-pearl)] pt-3.5';

  return (
    <div className={wrapClass}>
      <button
        type="button"
        disabled={busy}
        onClick={guard(onAccept)}
        className={`${BASE_BTN} border-[#CBAE86] text-[var(--color-mocha)] enabled:hover:bg-[#F0E7D6]`}
      >
        Accept · begin
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={guard(onNurture)}
        className={`${BASE_BTN} border-[var(--doc-ink-border)] text-[var(--text-muted)] enabled:hover:border-[#C2CDD6] enabled:hover:text-[var(--color-dusty-blue)]`}
      >
        Nurture
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={guard(onPass)}
        className={`${BASE_BTN} border-[var(--doc-ink-border)] text-[var(--text-muted)] enabled:hover:border-[#E3C3B4] enabled:hover:text-[var(--color-terracotta)]`}
      >
        Pass
      </button>
    </div>
  );
}
