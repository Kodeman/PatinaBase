'use client';

/**
 * Triage bar (Track 6 · rulings R61 + R65) — the lead-intake act that was
 * missing.
 *
 * A captured lead already surfaces as a Brief folder (`document_state` Shape C,
 * `new_lead` need). This is the inline affordance that lets the designer act on
 * it without leaving the Desk (the `desk` variant, inside the folder card) or
 * from inside the open Brief document (the `brief` variant).
 *
 * The three verbs map onto the prototype's triage block (G1):
 *   · Accept · begin → `useBeginDiscovery`  — lead 'accepted' + relationship
 *     'lead' → the folder flips Brief (Shape C) → Discovery (Shape D),
 *     "Schedule the discovery call". (NOT `useAcceptLead`, which jumps to
 *     'active' and is invisible in `document_state` — verified, R61.)
 *   · Nurture     → `useNurtureLead` (R65) — picks a RECONNECT DATE: the lead
 *     leaves the needs-hand band now (status='contacted' + the desk-derivation
 *     gate) and rises again as a Desk need ('reconnect_due') when the date is
 *     due. A dated thing earns a return (R22); an undated nurture is only a
 *     hope — so Nurture always asks for a date.
 *   · Pass        → `useDeclineLead` — drops Shape C, stays in People declined.
 *
 * One-act-many-surfaces (spec §5): each action's own onSuccess invalidates the
 * Desk query key `['document-state','desk']` (use-desk-engagements.ts) AND
 * `['leads']`, so the folder re-derives/flips without a reload.
 *
 * D4: zero shadows — flat hairline-bordered buttons. D1: no navigation/reset
 * side effect; on the Desk the buttons `stopPropagation` so they never trip the
 * card's pick-up link.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBeginDiscovery, useNurtureLead, useDeclineLead } from '@patina/supabase';

type Variant = 'desk' | 'brief';

const BASE_BTN =
  'flex-1 rounded-[2px] border bg-transparent px-0 py-[7px] text-center font-mono text-[10.5px] tracking-[0.04em] transition-colors disabled:cursor-default disabled:opacity-45';

/** R65 reconnect presets — a dated touchpoint, computed at click time. */
const RECONNECT_PRESETS: ReadonlyArray<{ label: string; at: () => string }> = [
  { label: 'In 1 week', at: () => addDays(7) },
  { label: 'In 1 month', at: () => addMonths(1) },
  { label: 'In 3 months', at: () => addMonths(3) },
];

function addDays(days: number): string {
  const t = new Date();
  t.setDate(t.getDate() + days);
  return t.toISOString();
}
function addMonths(months: number): string {
  const t = new Date();
  t.setMonth(t.getMonth() + months);
  return t.toISOString();
}

export function TriageBar({
  leadId,
  variant = 'desk',
}: {
  leadId: string;
  variant?: Variant;
}) {
  const qc = useQueryClient();
  const beginDiscovery = useBeginDiscovery();
  const nurture = useNurtureLead();
  const decline = useDeclineLead();

  // When true the bar shows the reconnect-date presets instead of the verbs.
  const [pickingDate, setPickingDate] = useState(false);

  const busy = beginDiscovery.isPending || nurture.isPending || decline.isPending;

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
  const onPass = () => decline.mutate({ leadId }, { onSuccess: refreshDesk });
  const onReconnect = (reconnectAt: string) =>
    nurture.mutate(
      { leadId, reconnectAt },
      {
        onSuccess: () => {
          setPickingDate(false);
          refreshDesk();
        },
      },
    );

  const wrapClass =
    variant === 'desk'
      ? 'mt-3.5 border-t border-[var(--color-pearl)] pt-3'
      : 'mt-4 border-t border-[var(--color-pearl)] pt-3.5';

  // R65 — Nurture asks for a reconnect date before it commits.
  if (pickingDate) {
    return (
      <div className={wrapClass}>
        <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Reconnect…
        </p>
        <div className="flex gap-2">
          {RECONNECT_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={busy}
              onClick={guard(() => onReconnect(p.at()))}
              className={`${BASE_BTN} border-[var(--doc-ink-border)] text-[var(--text-muted)] enabled:hover:border-[#C2CDD6] enabled:hover:text-[var(--color-dusty-blue)]`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={guard(() => setPickingDate(false))}
            className="shrink-0 px-2 font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--text-muted)] enabled:hover:text-[var(--color-charcoal)]"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${wrapClass} flex gap-2`}>
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
        onClick={guard(() => setPickingDate(true))}
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
