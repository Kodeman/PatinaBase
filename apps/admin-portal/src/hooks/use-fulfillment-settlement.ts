import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SettlementPreview } from '@patina/fulfillment';
import { fulfillmentSettlementService } from '@/services/fulfillment';
import { fulfillmentKeys } from './use-fulfillment-queue';

// Settlement's data layer (S7, spec §8). Preview is a mutation (re-run as the
// operator types the vendor invoice) — it mirrors the real settle_po's T3 +
// pledge (+ T6) posting exactly (preview == posted). Commit invalidates the root
// so the settled PO leaves the queue live.

export function useSettlementPreview(poId: string) {
  return useMutation<SettlementPreview, Error, { vendorInvoiceCents: number }>({
    mutationFn: ({ vendorInvoiceCents }) =>
      fulfillmentSettlementService.preview(poId, vendorInvoiceCents),
  });
}

export function useSettlePo(poId: string) {
  const qc = useQueryClient();
  return useMutation<Record<string, unknown>, Error, { vendorInvoiceCents: number; varianceReason?: string }>({
    mutationFn: (payload) => fulfillmentSettlementService.settle(poId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fulfillmentKeys.all });
    },
  });
}
