import { useQuery } from '@tanstack/react-query';
import { useCommsDashboard } from '@patina/supabase/hooks';
import { usePipelineMetrics } from '@/hooks/use-pipeline';
import type { ApplicationsMetrics } from '@/app/api/admin/applications-metrics/route';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

async function fetchApplicationsMetrics(): Promise<ApplicationsMetrics> {
  const res = await fetch('/api/admin/applications-metrics', { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load applications metrics (${res.status})`);
  }
  const json = (await res.json()) as { data: ApplicationsMetrics };
  return json.data;
}

async function fetchOrdersTotal(): Promise<number | null> {
  // Total all-time orders via existing proxy. Today/week + revenue is a P1 follow-up.
  try {
    const res = await fetch('/api/orders?page=1&pageSize=1', { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    // Orders service returns { data, pagination: { total } }; some proxies wrap as { data: { meta } }
    return (
      json?.pagination?.total ??
      json?.data?.pagination?.total ??
      json?.data?.meta?.total ??
      null
    );
  } catch {
    return null;
  }
}

export function useApplicationsMetrics() {
  return useQuery({
    queryKey: ['applications-metrics'],
    queryFn: fetchApplicationsMetrics,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 60_000,
  });
}

export function useOrdersTotal() {
  return useQuery({
    queryKey: ['orders-total'],
    queryFn: fetchOrdersTotal,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 60_000,
  });
}

export function useDashboardMetrics() {
  const pipeline = usePipelineMetrics();
  const comms = useCommsDashboard('24h');
  const applications = useApplicationsMetrics();
  const orders = useOrdersTotal();

  return {
    pipeline,
    comms,
    applications,
    orders,
    isLoading:
      pipeline.isLoading || comms.isLoading || applications.isLoading || orders.isLoading,
  };
}
