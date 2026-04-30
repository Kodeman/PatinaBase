import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { AuditLogListResponse } from '@/app/api/admin/audit-logs/route';

export interface AdminAuditLogFilters {
  q?: string;
  action?: string;
  resourceType?: string;
  status?: 'success' | 'failure' | 'denied';
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

function buildSearchParams(filters: AdminAuditLogFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.action) params.set('action', filters.action);
  if (filters.resourceType) params.set('resourceType', filters.resourceType);
  if (filters.status) params.set('status', filters.status);
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  params.set('page', String(filters.page ?? 1));
  params.set('pageSize', String(filters.pageSize ?? 50));
  return params.toString();
}

async function fetchAuditLogs(filters: AdminAuditLogFilters): Promise<AuditLogListResponse> {
  const res = await fetch(`/api/admin/audit-logs?${buildSearchParams(filters)}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load audit logs (${res.status})`);
  }
  const json = (await res.json()) as { data: AuditLogListResponse };
  return json.data;
}

export function useAdminAuditLogs(filters: AdminAuditLogFilters) {
  return useQuery({
    queryKey: ['admin-audit-logs', filters],
    queryFn: () => fetchAuditLogs(filters),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}
