'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Session {
  id: string;
  userId: string;
  ipHash: string | null;
  uaHash: string | null;
  deviceInfo: Record<string, any> | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

/**
 * Fetch current user's sessions
 */
async function fetchSessions(): Promise<Session[]> {
  const res = await fetch('/api/me/sessions');
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to fetch sessions');
  }
  return res.json();
}

/**
 * Revoke a specific session
 */
async function revokeSession(sessionId: string): Promise<void> {
  const res = await fetch(`/api/me/sessions/${sessionId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to revoke session');
  }
}

/**
 * Revoke all other sessions
 */
async function revokeAllSessions(): Promise<void> {
  const res = await fetch('/api/me/sessions', {
    method: 'DELETE',
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to revoke sessions');
  }
}

/**
 * Hook to fetch user sessions
 */
export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessions,
    staleTime: 1000 * 30, // 30 seconds
    retry: 2,
  });
}

/**
 * Hook to revoke a specific session
 */
export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: revokeSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

/**
 * Hook to revoke all other sessions
 */
export function useRevokeAllSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: revokeAllSessions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}
