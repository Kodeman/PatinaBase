'use client';

import { useEffect } from 'react';
import {
  useDecision,
  useDecisionsByProject,
  useMarkDecisionViewed,
  useSelectDecisionOption,
} from '@patina/supabase';
import type { ClientDecision } from '@patina/supabase';

/**
 * Fetch a single decision and auto-mark it as viewed by the client.
 */
export function useClientDecision(decisionId: string) {
  const result = useDecision(decisionId);
  const markViewed = useMarkDecisionViewed();

  useEffect(() => {
    if (result.data && !result.data.viewed_at && result.data.status === 'pending') {
      markViewed.mutate({ decisionId });
    }
    // Only run when decision first loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.data?.id]);

  return result;
}

/**
 * Fetch all decisions for a project, filtered to pending ones for the client.
 */
export function useClientProjectDecisions(projectId: string) {
  return useDecisionsByProject(projectId);
}

/**
 * Filter decisions by linked phase for milestone integration.
 */
export function filterDecisionsByPhase(decisions: ClientDecision[], phase: string): ClientDecision[] {
  return decisions.filter(
    (d) => d.linked_phase?.toLowerCase() === phase.toLowerCase() && d.status !== 'draft'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Track 5 — the client mirror. client_decisions is now the widened coordination
// table, so the client can read coordination items that aren't theirs to act on
// (RFIs, submittals, punch items, or anything sitting in the designer / GC /
// vendor court). Scope the list so the client's "your move" pile only contains
// items they actually act on; everything else is shown quietly as read-only.
//
// Legacy pure-selection / approval decisions have coordination_kind / court
// undefined → they default to selection / client → they remain "actionable",
// so the existing list is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

/** A coordination item the client acts on directly: a selection or sign-off in
 *  their own court. Defaults reproduce the legacy decision exactly. */
export function isClientActionableDecision(decision: ClientDecision): boolean {
  const court = decision.court ?? 'client';
  if (court !== 'client') return false;
  const kind = decision.coordination_kind ?? 'selection';
  return kind === 'selection' || kind === 'signoff';
}

// Re-export for convenience
export { useSelectDecisionOption };
