import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersService, CreateUserRequest, UpdateUserRequest } from '@/services/users';
import type { User } from '@/types';

// Query keys
export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>) => [...userKeys.lists(), filters] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  sessions: (userId: string) => [...userKeys.all, 'sessions', userId] as const,
  activity: (userId: string) => [...userKeys.all, 'activity', userId] as const,
};

// Fetch single user
export function useUser(userId: string) {
  return useQuery({
    queryKey: userKeys.detail(userId),
    queryFn: () => usersService.getUser(userId),
    enabled: !!userId,
  });
}

// Fetch user sessions
export function useUserSessions(userId: string) {
  return useQuery({
    queryKey: userKeys.sessions(userId),
    queryFn: () => usersService.getUserSessions(userId),
    enabled: !!userId,
  });
}

// Suspend user mutation
export function useSuspendUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      await usersService.suspendUser(userId, reason);
    },
    onSuccess: (_, variables) => {
      // Invalidate user queries to refetch updated data
      queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.userId) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

// Ban user mutation
export function useBanUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      await usersService.banUser(userId, reason);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.userId) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

// Activate/Reactivate user mutation
export function useActivateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await usersService.reactivateUser(userId);
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

// Verify email mutation
export function useVerifyEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await usersService.verifyEmail(userId);
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

// Revoke single session mutation
export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, sessionId }: { userId: string; sessionId: string }) => {
      await usersService.revokeSession(userId, sessionId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: userKeys.sessions(variables.userId) });
    },
  });
}

// Revoke all sessions mutation
export function useRevokeAllSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await usersService.revokeAllSessions(userId);
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: userKeys.sessions(userId) });
    },
  });
}

// Assign role mutation
export function useAssignRole() {
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
      queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.userId) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

// Revoke role mutation
export function useRevokeRole() {
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
      queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.userId) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

// Create user mutation
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateUserRequest) => usersService.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

// Update user mutation
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: UpdateUserRequest }) =>
      usersService.updateUser(userId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.userId) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

// Fetch user activity (audit logs)
export function useUserActivity(userId: string, limit = 50, offset = 0) {
  return useQuery({
    queryKey: [...userKeys.activity(userId), { limit, offset }],
    queryFn: () => usersService.getUserActivity(userId, { limit, offset }),
    enabled: !!userId,
  });
}
