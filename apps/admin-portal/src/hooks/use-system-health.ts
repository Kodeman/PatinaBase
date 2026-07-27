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

export interface UseSystemHealthOptions {
  /**
   * Restore the 15s background poll. Default false — mount + window-focus
   * refetch only. Cloudflare Containers bill wall-clock while awake, so a
   * page that merely surfaces this data (e.g. the dashboard landing page)
   * must not keep pinging service /health endpoints in the background;
   * pages dedicated to monitoring (the /health page) opt in explicitly.
   */
  poll?: boolean;
}

export function useSystemHealth(opts: UseSystemHealthOptions = {}) {
  const { poll = false } = opts;
  return useQuery({
    queryKey: ['system-health'],
    queryFn: fetchSystemHealth,
    refetchInterval: poll ? POLL_INTERVAL_MS : false,
    staleTime: 5_000,
  });
}
