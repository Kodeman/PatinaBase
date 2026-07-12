import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { morningBriefService, type DailyBrief } from '@/services/morning-brief';

// One canonical query key — the brief is a single row (today's, or the
// latest fallback), so there's no list/detail split like agent-tasks.
export const briefKeys = {
  all: ['morning-brief'] as const,
};

/** Today's Chicago-date brief (falls back to the latest available row server-side). */
export function useMorningBrief() {
  return useQuery({
    queryKey: briefKeys.all,
    queryFn: () => morningBriefService.get(),
    staleTime: 60_000,
  });
}

/** Admin "Regenerate" action. Replaces the cached brief with the fresh row on success. */
export function useRegenerateBrief() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => morningBriefService.regenerate(),
    onSuccess: (data: DailyBrief | null) => {
      qc.setQueryData(briefKeys.all, data);
      qc.invalidateQueries({ queryKey: briefKeys.all });
    },
  });
}
