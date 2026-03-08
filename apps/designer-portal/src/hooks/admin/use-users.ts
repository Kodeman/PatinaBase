import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersService } from '@/services/admin/users';
import type { User } from '@/types';

// Query keys
export const adminUserKeys = {
  all: ['admin', 'users'] as const,
  lists: () => [...adminUserKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>) => [...adminUserKeys.lists(), filters] as const,
  details: () => [...adminUserKeys.all, 'detail'] as const,
  detail: (id: string) => [...adminUserKeys.details(), id] as const,
  sessions: (userId: string) => [...adminUserKeys.all, 'sessions', userId] as const,
};

// Fetch single user
export function useAdminUser(userId: string) {
  return useQuery({
    queryKey: adminUserKeys.detail(userId),
    queryFn: async () => {
      const response = await usersService.getUser(userId);
      return response.data;
    },
    enabled: !!userId,
  });
}

// Fetch user sessions
export function useAdminUserSessions(userId: string) {
  return useQuery({
    queryKey: adminUserKeys.sessions(userId),
    queryFn: async () => {
      const response = await usersService.getUserSessions(userId);
      return response.data;
    },
    enabled: !!userId,
  });
}

// Suspend user mutation
export function useSuspendAdminUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      await usersService.suspendUser(userId, reason);
    },
    onSuccess: (_, variables) => {
      // Invalidate user queries to refetch updated data
      queryClient.invalidateQueries({ queryKey: adminUserKeys.detail(variables.userId) });
      queryClient.invalidateQueries({ queryKey: adminUserKeys.lists() });
    },
  });
}

// Ban user mutation
export function useBanAdminUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      await usersService.banUser(userId, reason);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.detail(variables.userId) });
      queryClient.invalidateQueries({ queryKey: adminUserKeys.lists() });
    },
  });
}

// Activate/Reactivate user mutation
export function useActivateAdminUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await usersService.reactivateUser(userId);
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.detail(userId) });
      queryClient.invalidateQueries({ queryKey: adminUserKeys.lists() });
    },
  });
}

// Verify email mutation
export function useVerifyAdminEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await usersService.verifyEmail(userId);
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.detail(userId) });
      queryClient.invalidateQueries({ queryKey: adminUserKeys.lists() });
    },
  });
}

// Revoke single session mutation
export function useRevokeAdminSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, sessionId }: { userId: string; sessionId: string }) => {
      await usersService.revokeSession(userId, sessionId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.sessions(variables.userId) });
    },
  });
}

// Revoke all sessions mutation
export function useRevokeAllAdminSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await usersService.revokeAllSessions(userId);
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.sessions(userId) });
    },
  });
}

// Assign role mutation
export function useAssignAdminRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      roleId,
      reason
    }: {
      userId: string;
      roleId: string;
      reason?: string;
    }) => {
      await usersService.assignRole(userId, roleId, reason);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.detail(variables.userId) });
      queryClient.invalidateQueries({ queryKey: adminUserKeys.lists() });
    },
  });
}

// Revoke role mutation
export function useRevokeAdminRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      roleId,
      reason
    }: {
      userId: string;
      roleId: string;
      reason?: string;
    }) => {
      await usersService.revokeRole(userId, roleId, reason);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminUserKeys.detail(variables.userId) });
      queryClient.invalidateQueries({ queryKey: adminUserKeys.lists() });
    },
  });
}
