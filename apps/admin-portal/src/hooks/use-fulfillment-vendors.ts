import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fulfillmentVendorsService } from '@/services/fulfillment';
import { fulfillmentKeys } from './use-fulfillment-queue';

// Vendor Directory data layer (S4, spec §7). See use-fulfillment-notifications.ts
// for why fulfillmentKeys is imported, not modified.

export const vendorKeys = {
  list: () => [...fulfillmentKeys.all, 'vendors'] as const,
  detail: (vendorId: string) => [...fulfillmentKeys.all, 'vendors', vendorId] as const,
};

export function useVendorDirectory() {
  return useQuery({
    queryKey: vendorKeys.list(),
    queryFn: () => fulfillmentVendorsService.listVendors(),
    staleTime: 30_000,
  });
}

export function useVendorDetail(vendorId: string | null) {
  return useQuery({
    queryKey: vendorKeys.detail(vendorId ?? ''),
    queryFn: () => fulfillmentVendorsService.getVendor(vendorId as string),
    enabled: !!vendorId,
    staleTime: 10_000,
  });
}

/** The Directory's "Add vendor" affordance (I15) — invalidates the whole
 *  fulfillment root key on success, same as every other fulfillment
 *  mutation hook (see use-fulfillment-shipments.ts's useRecordEtaChange). */
export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; website?: string; notes?: string }) =>
      fulfillmentVendorsService.createVendor(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
  });
}

export function useUpdateVendorProfile(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) => fulfillmentVendorsService.updateVendorProfile(vendorId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vendorKeys.detail(vendorId) });
      qc.invalidateQueries({ queryKey: vendorKeys.list() });
    },
  });
}
