import { useQuery } from '@tanstack/react-query';
import type { SystemHealth } from '@/app/api/admin/health/route';

const POLL_INTERVAL_MS = 15_000;

async function fetchSystemHealth(): Promise<SystemHealth> {
  const res = await fetch('/api/admin/health', { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load system health (${res.status})`);
  }
  const json = (await res.json()) as { data: SystemHealth };
  return json.data;
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: fetchSystemHealth,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 5_000,
  });
}
