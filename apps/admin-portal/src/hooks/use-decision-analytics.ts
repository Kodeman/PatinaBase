import { useQuery } from '@tanstack/react-query';
import type { DecisionAnalyticsResponse } from '@/app/api/admin/decision-analytics/route';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

async function fetchDecisionAnalytics(): Promise<DecisionAnalyticsResponse> {
  const res = await fetch('/api/admin/decision-analytics', { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load decision analytics (${res.status})`);
  }
  const json = (await res.json()) as { data: DecisionAnalyticsResponse };
  return json.data;
}

export function useDecisionAnalytics() {
  return useQuery({
    queryKey: ['admin-decision-analytics'],
    queryFn: fetchDecisionAnalytics,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 60_000,
  });
}
