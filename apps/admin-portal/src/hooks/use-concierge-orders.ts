import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  conciergeOrdersService,
  type AdvanceInput,
  type ChecklistToggleInput,
  type ConciergeOrderFilters,
  type CreateConciergeOrderInput,
  type EnterDamageInput,
} from '@/services/concierge-orders';

// ─── Query keys ──────────────────────────────────────────────────────────────
// One canonical factory (mirrors use-pipelines.ts). all() is the invalidation
// root; every mutation invalidates it so both the list and any open detail
// refetch after a stage move / checklist toggle / damage entry.
export const conciergeOrderKeys = {
  all: ['concierge-orders'] as const,
  lists: () => [...conciergeOrderKeys.all, 'list'] as const,
  list: (filters?: ConciergeOrderFilters) => [...conciergeOrderKeys.lists(), filters ?? {}] as const,
  details: () => [...conciergeOrderKeys.all, 'detail'] as const,
  detail: (id: string) => [...conciergeOrderKeys.details(), id] as const,
};

export function useConciergeOrders(filters?: ConciergeOrderFilters) {
  return useQuery({
    queryKey: conciergeOrderKeys.list(filters),
    queryFn: () => conciergeOrdersService.list(filters),
    staleTime: 15_000,
  });
}

export function useConciergeOrder(id: string | null) {
  return useQuery({
    queryKey: conciergeOrderKeys.detail(id ?? ''),
    queryFn: () => conciergeOrdersService.get(id as string),
    enabled: !!id,
    staleTime: 10_000,
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: conciergeOrderKeys.all });
}

export function useCreateConciergeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConciergeOrderInput) => conciergeOrdersService.create(input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAdvanceConciergeOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdvanceInput) => conciergeOrdersService.advance(id, input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useToggleConciergeChecklistItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChecklistToggleInput) => conciergeOrdersService.toggleChecklistItem(id, input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useEnterConciergeDamageMode(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EnterDamageInput) => conciergeOrdersService.enterDamageMode(id, input),
    onSuccess: () => invalidateAll(qc),
  });
}
