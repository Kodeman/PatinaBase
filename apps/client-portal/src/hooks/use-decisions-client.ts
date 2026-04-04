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

// Re-export for convenience
export { useSelectDecisionOption };
