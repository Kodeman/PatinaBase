import { useQuery } from '@tanstack/react-query';
import type { SystemVersions } from '@/app/api/admin/system/versions/route';

const POLL_INTERVAL_MS = 30_000;

async function fetchSystemVersions(): Promise<SystemVersions> {
  const res = await fetch('/api/admin/system/versions', { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load versions (${res.status})`);
  }
  const json = (await res.json()) as { data: SystemVersions };
  return json.data;
}

export function useSystemVersions() {
  return useQuery({
    queryKey: ['system-versions'],
    queryFn: fetchSystemVersions,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 10_000,
  });
}
