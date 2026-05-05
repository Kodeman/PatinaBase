import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@supabase/ssr';

const getSupabase = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export interface DlqEntry {
  id: string;
  user_id: string;
  type: string;
  channel: 'email' | 'push' | 'in_app' | 'sms';
  status: string;
  template_id: string | null;
  metadata: Record<string, unknown> | null;
  error: string | null;
  retry_count: number;
  provider_id: string | null;
  created_at: string;
  recipient_email: string | null;
  recipient_name: string | null;
  replayed_at: string | null;
  replay_invocation_id: string | null;
}

export interface DlqFilters {
  since?: string | null;
  type?: string | null;
  offset?: number;
  limit?: number;
}

export interface DlqListResult {
  rows: DlqEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface RetryDlqResult {
  ok: boolean;
  id: string;
  provider_id?: string | null;
  notification_id?: string | null;
}

export interface BulkRetryDlqResult {
  ok: boolean;
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{
    id: string;
    ok: boolean;
    error?: string;
    provider_id?: string | null;
    notification_id?: string | null;
  }>;
}

export const dlqKeys = {
  all: ['dlq'] as const,
  list: (filters: DlqFilters) => ['dlq', 'list', filters] as const,
  failedCount: (since: string | null) => ['dlq', 'failed-count', since] as const,
};

function buildQueryString(filters: DlqFilters): string {
  const params = new URLSearchParams();
  if (filters.since) params.set('since', filters.since);
  if (filters.type) params.set('type', filters.type);
  if (typeof filters.offset === 'number') params.set('offset', String(filters.offset));
  if (typeof filters.limit === 'number') params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useDlqEntries(filters: DlqFilters = {}) {
  return useQuery<DlqListResult>({
    queryKey: dlqKeys.list(filters),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/admin/comms/dlq${buildQueryString(filters)}`,
        { headers },
      );
      if (!res.ok) throw new Error(`Failed to load DLQ: ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useFailedNotificationCount(since: string | null) {
  return useQuery<{ total: number }>({
    queryKey: dlqKeys.failedCount(since),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({ limit: '1', offset: '0' });
      if (since) params.set('since', since);
      const res = await fetch(`/api/admin/comms/dlq?${params.toString()}`, { headers });
      if (!res.ok) throw new Error(`Failed to load DLQ count: ${res.status}`);
      const data = (await res.json()) as DlqListResult;
      return { total: data.total };
    },
    staleTime: 60_000,
  });
}

export function useRetryDlqEntry() {
  const qc = useQueryClient();
  return useMutation<RetryDlqResult, Error, string>({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/dlq/${id}/retry`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Retry failed: ${res.status} ${text}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dlqKeys.all });
    },
  });
}

export function useBulkRetryDlq() {
  const qc = useQueryClient();
  return useMutation<BulkRetryDlqResult, Error, string[]>({
    mutationFn: async (ids: string[]) => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/comms/dlq/bulk-retry', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Bulk retry failed: ${res.status} ${text}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dlqKeys.all });
    },
  });
}
