import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fulfillmentLeahService, type LeahSubstitutionReview } from '@/services/fulfillment';
import { fulfillmentKeys } from './use-fulfillment-queue';

// The Leah substitution reviews (S7, R1.4) — a SECOND card source for the
// existing LeahReviewDeck at /mission-control?assignee=leah. leah_reviews is the
// cross-track contract; this hook lists the pending ones and rules them (which
// writes back to the exception + drafts the client note server-side).

export function useLeahSubstitutionReviews() {
  return useQuery({
    queryKey: fulfillmentKeys.leahReviews(),
    queryFn: () => fulfillmentLeahService.listReviews(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useRuleLeahReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: 'approved' | 'rejected' }) =>
      fulfillmentLeahService.rule(vars.id, vars.status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.leahReviews() });
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
  });
}

export type { LeahSubstitutionReview };
