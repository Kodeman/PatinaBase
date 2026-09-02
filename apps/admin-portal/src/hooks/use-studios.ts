import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  studiosService,
  type CreateStudioRequest,
  type UpdateStudioRequest,
  type AddStudioMemberRequest,
  type UpdateStudioMemberRequest,
  type InviteStudioMemberRequest,
} from '@/services/studios';
import { userKeys } from '@/hooks/use-users';

export const studioKeys = {
  all: ['studios'] as const,
  lists: () => [...studioKeys.all, 'list'] as const,
  list: (filters?: Record<string, any>) => [...studioKeys.lists(), filters] as const,
  details: () => [...studioKeys.all, 'detail'] as const,
  detail: (id: string) => [...studioKeys.details(), id] as const,
  members: (id: string) => [...studioKeys.all, 'members', id] as const,
  projects: (id: string) => [...studioKeys.all, 'projects', id] as const,
  activity: (id: string) => [...studioKeys.all, 'activity', id] as const,
  userSearch: (q: string, excludeStudioId?: string) =>
    [...studioKeys.all, 'user-search', q, excludeStudioId] as const,
};

export function useStudios(filters?: {
  query?: string;
  status?: string;
  tier?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: studioKeys.list(filters),
    queryFn: () => studiosService.getStudios(filters),
  });
}

export function useStudio(studioId: string) {
  return useQuery({
    queryKey: studioKeys.detail(studioId),
    queryFn: () => studiosService.getStudio(studioId),
    enabled: !!studioId,
  });
}

export function useStudioMembers(studioId: string) {
  return useQuery({
    queryKey: studioKeys.members(studioId),
    queryFn: () => studiosService.getStudioMembers(studioId),
    enabled: !!studioId,
  });
}

export function useStudioProjects(studioId: string, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: [...studioKeys.projects(studioId), { page, pageSize }],
    queryFn: () => studiosService.getStudioProjects(studioId, { page, pageSize }),
    enabled: !!studioId,
  });
}

export function useStudioActivity(studioId: string, limit = 50, offset = 0) {
  return useQuery({
    queryKey: [...studioKeys.activity(studioId), { limit, offset }],
    queryFn: () => studiosService.getStudioActivity(studioId, { limit, offset }),
    enabled: !!studioId,
  });
}

export function useStudioUserSearch(q: string, excludeStudioId?: string) {
  return useQuery({
    queryKey: studioKeys.userSearch(q, excludeStudioId),
    queryFn: () => studiosService.searchUsers({ q, excludeStudioId }),
    enabled: q.trim().length >= 2,
  });
}

export function useCreateStudio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateStudioRequest) => studiosService.createStudio(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: studioKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userKeys.studios(variables.ownerUserId) });
    },
  });
}

export function useUpdateStudio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ studioId, data }: { studioId: string; data: UpdateStudioRequest }) =>
      studiosService.updateStudio(studioId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: studioKeys.detail(variables.studioId) });
      queryClient.invalidateQueries({ queryKey: studioKeys.lists() });
    },
  });
}

export function useSetStudioStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      studioId,
      status,
      reason,
    }: {
      studioId: string;
      status: string;
      reason?: string;
    }) => studiosService.setStudioStatus(studioId, status, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: studioKeys.detail(variables.studioId) });
      queryClient.invalidateQueries({ queryKey: studioKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studioKeys.activity(variables.studioId) });
    },
  });
}

function invalidateRoster(
  queryClient: ReturnType<typeof useQueryClient>,
  studioId: string,
  userId?: string,
) {
  queryClient.invalidateQueries({ queryKey: studioKeys.members(studioId) });
  queryClient.invalidateQueries({ queryKey: studioKeys.detail(studioId) });
  queryClient.invalidateQueries({ queryKey: studioKeys.lists() });
  queryClient.invalidateQueries({ queryKey: studioKeys.activity(studioId) });
  if (userId) {
    queryClient.invalidateQueries({ queryKey: userKeys.studios(userId) });
  }
}

export function useAddStudioMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ studioId, data }: { studioId: string; data: AddStudioMemberRequest }) =>
      studiosService.addStudioMember(studioId, data),
    onSuccess: (_, variables) => {
      invalidateRoster(queryClient, variables.studioId, variables.data.userId);
    },
  });
}

export function useUpdateStudioMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      studioId,
      memberId,
      data,
    }: {
      studioId: string;
      memberId: string;
      userId?: string;
      data: UpdateStudioMemberRequest;
    }) => studiosService.updateStudioMember(studioId, memberId, data),
    onSuccess: (_, variables) => {
      invalidateRoster(queryClient, variables.studioId, variables.userId);
    },
  });
}

export function useRemoveStudioMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      studioId,
      memberId,
      userId,
    }: {
      studioId: string;
      memberId: string;
      userId?: string;
    }) => studiosService.removeStudioMember(studioId, memberId),
    onSuccess: (_, variables) => {
      invalidateRoster(queryClient, variables.studioId, variables.userId);
    },
  });
}

export function useInviteStudioMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ studioId, data }: { studioId: string; data: InviteStudioMemberRequest }) =>
      studiosService.inviteStudioMember(studioId, data),
    onSuccess: (_, variables) => {
      invalidateRoster(queryClient, variables.studioId);
    },
  });
}

export function useTransferStudioOwnership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ studioId, newOwnerUserId }: { studioId: string; newOwnerUserId: string }) =>
      studiosService.transferOwnership(studioId, newOwnerUserId),
    onSuccess: (_, variables) => {
      invalidateRoster(queryClient, variables.studioId, variables.newOwnerUserId);
    },
  });
}
