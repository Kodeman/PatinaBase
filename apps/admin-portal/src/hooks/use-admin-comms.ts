import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type {
  AdminThreadsListResponse,
  ThreadKind,
} from '@/app/api/admin/comms/threads/route';
import type { AdminThreadDetail } from '@/app/api/admin/comms/threads/[id]/route';

interface AdminThreadFilters {
  kind?: ThreadKind | 'all';
  page?: number;
  pageSize?: number;
}

async function fetchThreads(filters: AdminThreadFilters): Promise<AdminThreadsListResponse> {
  const params = new URLSearchParams();
  if (filters.kind && filters.kind !== 'all') params.set('kind', filters.kind);
  params.set('page', String(filters.page ?? 1));
  params.set('pageSize', String(filters.pageSize ?? 50));

  const res = await fetch(`/api/admin/comms/threads?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load threads (${res.status})`);
  }
  const json = (await res.json()) as { data: AdminThreadsListResponse };
  return json.data;
}

async function fetchThread(id: string): Promise<AdminThreadDetail> {
  const res = await fetch(`/api/admin/comms/threads/${id}`, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load thread (${res.status})`);
  }
  const json = (await res.json()) as { data: AdminThreadDetail };
  return json.data;
}

export function useAdminThreads(filters: AdminThreadFilters) {
  return useQuery({
    queryKey: ['admin-threads', filters],
    queryFn: () => fetchThreads(filters),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useAdminThread(id: string | null | undefined) {
  return useQuery({
    queryKey: ['admin-thread', id],
    queryFn: () => fetchThread(id as string),
    enabled: !!id,
    staleTime: 15_000,
  });
}
