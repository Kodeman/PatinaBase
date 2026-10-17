/**
 * Query keys for the approved pricing snapshot and the post-approval change
 * log (US-37 #4, migration 00810). `eventsForProject` is the prefix that
 * reaches every item-scoped events query of a job.
 */
export const pricingApprovalKeys = {
  approval: (projectId: string) => ['project-pricing-approval', projectId] as const,
  eventsForProject: (projectId: string) => ['ffe-pricing-events', projectId] as const,
  events: (projectId: string, itemId?: string | null) =>
    ['ffe-pricing-events', projectId, itemId ?? null] as const,
};
