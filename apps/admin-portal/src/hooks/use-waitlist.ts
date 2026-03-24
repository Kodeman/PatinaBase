/**
 * React Query hooks for Waitlist management
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { waitlistService } from '@/services/waitlist';
import type { WaitlistFilters } from '@/services/waitlist';

export const waitlistKeys = {
  all: ['waitlist'] as const,
  entries: (filters?: WaitlistFilters) => [...waitlistKeys.all, 'entries', filters] as const,
  stats: () => [...waitlistKeys.all, 'stats'] as const,
};

export function useWaitlistEntries(filters?: WaitlistFilters) {
  return useQuery({
    queryKey: waitlistKeys.entries(filters),
    queryFn: () => waitlistService.getEntries(filters),
  });
}

export function useWaitlistStats() {
  return useQuery({
    queryKey: waitlistKeys.stats(),
    queryFn: () => waitlistService.getStats(),
  });
}

/**
 * Returns a function to invalidate all waitlist queries.
 * Call after converting a waitlist entry to a user.
 */
export function useInvalidateWaitlist() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: waitlistKeys.all });
  };
}
