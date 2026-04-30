import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PrivacyOverviewResponse } from '@/app/api/admin/privacy/route';

const PRIVACY_KEY = ['admin-privacy'] as const;

async function fetchOverview(): Promise<PrivacyOverviewResponse> {
  const res = await fetch('/api/admin/privacy', { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load privacy overview (${res.status})`);
  }
  const json = (await res.json()) as { data: PrivacyOverviewResponse };
  return json.data;
}

export function usePrivacyOverview() {
  return useQuery({
    queryKey: PRIVACY_KEY,
    queryFn: fetchOverview,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

async function patchExport(id: string, action: 'approve' | 'unapprove') {
  const res = await fetch(`/api/admin/privacy/exports/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to update export (${res.status})`);
  }
}

async function patchDeletion(id: string, action: 'approve' | 'unapprove') {
  const res = await fetch(`/api/admin/privacy/deletions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to update deletion (${res.status})`);
  }
}

export function useApproveExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'unapprove' }) =>
      patchExport(id, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRIVACY_KEY });
    },
  });
}

export function useApproveDeletion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'unapprove' }) =>
      patchDeletion(id, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PRIVACY_KEY });
    },
  });
}
