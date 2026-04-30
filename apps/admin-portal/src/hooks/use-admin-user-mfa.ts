import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserMfaResponse } from '@/app/api/users/[id]/mfa/route';

async function fetchUserMfa(userId: string): Promise<UserMfaResponse> {
  const res = await fetch(`/api/users/${userId}/mfa`, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load MFA state (${res.status})`);
  }
  const json = (await res.json()) as { data: UserMfaResponse };
  return json.data;
}

async function patchUserMfa(userId: string, enforced: boolean): Promise<{ enforced: boolean }> {
  const res = await fetch(`/api/users/${userId}/mfa`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enforced }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to update MFA (${res.status})`);
  }
  const json = (await res.json()) as { data: { enforced: boolean } };
  return json.data;
}

export function useUserMfa(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['user-mfa', userId],
    queryFn: () => fetchUserMfa(userId as string),
    enabled: !!userId,
    staleTime: 30_000,
  });
}

export function useToggleUserMfaEnforced(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enforced: boolean) => patchUserMfa(userId, enforced),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-mfa', userId] });
    },
  });
}
