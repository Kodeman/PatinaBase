import { useQuery } from '@tanstack/react-query';
import { fulfillmentService } from '@/services/fulfillment';

// ─── Query keys ──────────────────────────────────────────────────────────────
// One canonical factory (mirrors use-concierge-orders.ts / use-pipelines.ts).
// `all` is the invalidation root — use-fulfillment-realtime.ts invalidates it
// on every fulfillment_events INSERT so the queue live-refreshes without a
// manual reload.
export const fulfillmentKeys = {
  all: ['fulfillment'] as const,
  queue: () => [...fulfillmentKeys.all, 'queue'] as const,
  detail: (orderId: string) => [...fulfillmentKeys.all, 'detail', orderId] as const,
};

/**
 * The Fulfillment Queue (S1) — every non-settled order, every band, in one
 * shot. staleTime is short (this is a live operational surface) and
 * refetchInterval is a resilience fallback for the realtime subscription
 * (use-fulfillment-realtime.ts), not the primary refresh mechanism.
 */
export function useFulfillmentQueue() {
  return useQuery({
    queryKey: fulfillmentKeys.queue(),
    queryFn: () => fulfillmentService.listQueue(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}
