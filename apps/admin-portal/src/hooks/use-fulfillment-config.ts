import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fulfillmentConfigService } from '@/services/fulfillment';
import { fulfillmentKeys } from './use-fulfillment-queue';

// Config editor data layer (S4, spec §10). See use-fulfillment-notifications.ts
// for why fulfillmentKeys is imported, not modified.

export const configKeys = {
  list: () => [...fulfillmentKeys.all, 'config'] as const,
};

export function useFulfillmentConfig() {
  return useQuery({
    queryKey: configKeys.list(),
    queryFn: () => fulfillmentConfigService.listConfig(),
    staleTime: 10_000,
  });
}

export function useUpdateFulfillmentConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { key: string; value: Record<string, unknown> }) =>
      fulfillmentConfigService.updateConfig(vars.key, vars.value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: configKeys.list() });
    },
  });
}
