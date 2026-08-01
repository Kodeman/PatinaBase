import {
  assessProposalPaymentSchedule,
  type ProposalPaymentMilestoneLike,
} from '@patina/supabase';

export interface ProposalSendReadinessInput {
  proposalTotalCents: number;
  clientTotalCents: number;
  milestones: ProposalPaymentMilestoneLike[];
  draftingGaps: string[];
}

export interface ProposalSendReadiness {
  blockers: string[];
  warnings: string[];
  requiresIncompleteAcknowledgement: boolean;
}

/**
 * Assesses the materialized client copy—not editor-local controls. Unsafe money
 * never gets an override; incomplete creative facets are explicit and require
 * acknowledgement so "Send as-is" cannot silently bypass an 83% draft.
 */
export function assessProposalSendReadiness({
  proposalTotalCents,
  clientTotalCents,
  milestones,
  draftingGaps,
}: ProposalSendReadinessInput): ProposalSendReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (proposalTotalCents !== clientTotalCents) {
    blockers.push(
      'The client preview is still refreshing and does not match the proposal total.',
    );
  }

  const paymentSchedule = assessProposalPaymentSchedule(
    milestones,
    clientTotalCents,
  );
  blockers.push(...paymentSchedule.issues.map((issue) => issue.message));

  if (draftingGaps.length > 0) {
    warnings.push(`Still missing: ${draftingGaps.join(', ')}.`);
  }

  return {
    blockers,
    warnings,
    requiresIncompleteAcknowledgement: draftingGaps.length > 0,
  };
}
