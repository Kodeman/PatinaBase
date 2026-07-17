import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FulfillmentComposerDTO } from '@patina/fulfillment';
import { fulfillmentService } from '@/services/fulfillment';
import { fulfillmentKeys } from './use-fulfillment-queue';

// The PO Composer's data layer (S3, spec §5.3). Extends the shared
// fulfillmentKeys factory with `composer(poId)` — never forks it — so the
// realtime channel (use-fulfillment-realtime.ts, which invalidates
// fulfillmentKeys.all on every fulfillment_events INSERT) refreshes the composer
// too: a transmit or ack fired here re-figures the transmission log, and a
// change fired elsewhere on the same PO's order re-figures this screen.
//
// Every mutation is a server round-trip (the fn's RPC is the sole state writer);
// on settle we invalidate the root so the composer, queue, and workbench all
// reconcile against the server's derived truth (no optimistic log editing — the
// log is append-only by construction).

export function useFulfillmentComposer(poId: string) {
  return useQuery({
    queryKey: fulfillmentKeys.composer(poId),
    queryFn: () => fulfillmentService.getComposer(poId),
    staleTime: 10_000,
    enabled: !!poId,
  });
}

/** Email transmit — the fn emails the vendor from orders@ and logs po.transmitted. */
export function useSendPo(poId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fulfillmentService.send(poId),
    onSettled: () => qc.invalidateQueries({ queryKey: fulfillmentKeys.all }),
  });
}

/** Portal/CSV transmit — archives the PDF + logs po.transmitted with the
 *  operator-entered method + reference. */
export function useMarkTransmitted(poId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { method: 'portal' | 'csv'; reference?: string }) =>
      fulfillmentService.markTransmitted(poId, vars),
    onSettled: () => qc.invalidateQueries({ queryKey: fulfillmentKeys.all }),
  });
}

/** Record a vendor ack — re-dates the committed ship (client ETA) + drafts the
 *  ETA-change client note. */
export function useAckPo(poId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { committedShip: string; ackMethod?: string; ackRef?: string }) =>
      fulfillmentService.ack(poId, vars),
    onSettled: () => qc.invalidateQueries({ queryKey: fulfillmentKeys.all }),
  });
}

export type { FulfillmentComposerDTO };
