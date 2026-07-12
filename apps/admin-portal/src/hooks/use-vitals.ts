import { useQuery } from '@tanstack/react-query';
import { vitalsService, type MarketplaceVitalRow } from '@/services/vitals';

export type { MarketplaceVitalRow };

// ─── Query keys ──────────────────────────────────────────────────────────────
export const vitalsKeys = {
  all: ['mission-control-vitals'] as const,
};

/**
 * The Marketplace Vitals strip (WP-1.2). Backed by a nightly-refreshed
 * materialized view (marketplace_vitals / 00301) — 5 minutes of staleness in
 * the client cache is cheap relative to that, so this polls far less
 * aggressively than the inbox list.
 */
export function useVitals() {
  return useQuery({
    queryKey: vitalsKeys.all,
    queryFn: () => vitalsService.list(),
    staleTime: 5 * 60_000,
  });
}
