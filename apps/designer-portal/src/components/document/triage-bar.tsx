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
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  useBeginDiscovery,
  useNurtureLead,
  useDeclineLead,
  useAcceptDesignRequest,
} from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { DocumentAction, DocumentActionGroup } from './document-action';

type Variant = 'desk' | 'brief';

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
  arrivalEligible = false,
}: {
  leadId: string;
  variant?: Variant;
  /** Arrival Ceremony needs a registered homeowner for its thread + notices. */
  arrivalEligible?: boolean;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const beginDiscovery = useBeginDiscovery();
  const nurture = useNurtureLead();
  const decline = useDeclineLead();
  // Arrival Arc (R106): flag-on, "Accept · begin" routes through the Match
  // Ceremony (`accept_design_request` is idempotent for a lead the caller
  // already owns — `already_yours`). Fail-closed: while the flag resolves
  // (or off) the useBeginDiscovery path below stays exactly as-is.
  const { value: arrivalArc, isLoading: arcLoading } =
    useFeatureFlag('arrival-arc');
  const acceptRequest = useAcceptDesignRequest();

  // When true the bar shows the reconnect-date presets instead of the verbs.
  const [pickingDate, setPickingDate] = useState(false);

  const busy =
    beginDiscovery.isPending ||
    nurture.isPending ||
    decline.isPending ||
    acceptRequest.isPending;

  // One-act-many-surfaces: the Desk re-derives without a reload (the mutation
  // hooks own ['leads']/['designer-clients']; the desk key is added here).
  const refreshDesk = () => {
    void qc.invalidateQueries({ queryKey: ['document-state', 'desk'] });
    void qc.invalidateQueries({ queryKey: ['leads'] });
  };

  // On the Desk this bar sits inside the card's face, beside — never nested
  // inside — the card's pick-up Link (folder-card.tsx keeps them siblings so
  // no <button> is ever a descendant of an <a>); the guard stays as a
  // defensive preventDefault+stopPropagation so these buttons can never
  // trigger navigation (D1) even if that structure changes again. In the
  // open Brief there's nothing to stop.
  const guard = (fn: () => void) => (e: React.MouseEvent) => {
    if (variant === 'desk') {
      e.preventDefault();
      e.stopPropagation();
    }
    fn();
  };

  const onAccept = () => {
    if (!arcLoading && arrivalArc && arrivalEligible) {
      acceptRequest.mutate(leadId, {
        onSuccess: () => {
          refreshDesk();
          router.push(`/ceremony/${leadId}`);
        },
      });
      return;
    }
    beginDiscovery.mutate(leadId, {
      onSuccess: ({ designerClientId }) => {
        refreshDesk();
        const destination = `/doc/${designerClientId}`;
        // The open Brief is the same engagement before its identity moves, so
        // replace it. From the Desk this is a new picked-up document.
        if (variant === 'brief') router.replace(destination);
        else router.push(destination);
      },
    });
  };
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
        <DocumentActionGroup
          surfaceKey={variant === 'desk' ? 'desk' : 'open-document'}
          regionKey="lead-reconnect-date"
          className="gap-2"
          aria-label="Choose a reconnect date"
        >
          {RECONNECT_PRESETS.map((p) => (
            <DocumentAction
              key={p.label}
              actionKey={`reconnect-${p.label.toLowerCase().replaceAll(' ', '-')}`}
              variant="secondary"
              disabled={busy}
              onClick={guard(() => onReconnect(p.at()))}
            >
              {p.label}
            </DocumentAction>
          ))}
          <DocumentAction
            actionKey="cancel-reconnect"
            variant="tertiary"
            disabled={busy}
            onClick={guard(() => setPickingDate(false))}
          >
            Cancel
          </DocumentAction>
        </DocumentActionGroup>
      </div>
    );
  }

  return (
    <DocumentActionGroup
      surfaceKey={variant === 'desk' ? 'desk' : 'open-document'}
      regionKey="lead-triage"
      className={`${wrapClass} gap-2`}
      aria-label="Lead triage"
    >
      <DocumentAction
        actionKey="accept-lead"
        variant="primary"
        disabled={busy && !beginDiscovery.isPending && !acceptRequest.isPending}
        loading={beginDiscovery.isPending || acceptRequest.isPending}
        loadingLabel="Beginning…"
        onClick={guard(onAccept)}
      >
        Accept · begin
      </DocumentAction>
      <DocumentAction
        actionKey="nurture-lead"
        variant="secondary"
        disabled={busy}
        onClick={guard(() => setPickingDate(true))}
      >
        Nurture
      </DocumentAction>
      <DocumentAction
        actionKey="decline-lead"
        variant="tertiary"
        disabled={busy && !decline.isPending}
        loading={decline.isPending}
        loadingLabel="Passing…"
        onClick={guard(onPass)}
        className="text-[var(--color-terracotta-ink)] decoration-[var(--color-terracotta)] hover:text-[var(--color-charcoal)]"
      >
        Pass
      </DocumentAction>
    </DocumentActionGroup>
  );
}
