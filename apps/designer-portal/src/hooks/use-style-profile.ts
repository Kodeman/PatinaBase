/**
 * Hooks for Style Profile management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mockData } from '@/data/mock-designer-data';
import { styleProfileApi } from '@/lib/api-client';
import { withMockData } from '@/lib/mock-data';
import { queryKeys } from '@/lib/react-query';

export function useStyleProfile(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.styleProfiles.detail(id) : ['styleProfiles', 'null'],
    queryFn: () => {
      if (!id) throw new Error('Profile ID required');
      return withMockData(
        () => styleProfileApi.getProfile(id),
        () => {
          const profile = mockData.getStyleProfile(id);
          if (!profile) throw new Error('Profile not found');
          return profile;
        }
      );
    },
    enabled: !!id,
  });
}

export function useStyleProfileVersions(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.styleProfiles.versions(id) : ['styleProfiles', 'versions', 'null'],
    queryFn: () => {
      if (!id) throw new Error('Profile ID required');
      return withMockData(
        () => styleProfileApi.getVersions(id),
        () => {
          const profile = mockData.getStyleProfile(id);
          if (!profile) return [];
          return [{ id: `${profile.id}-v1`, createdAt: new Date(), summary: profile.summary }];
        }
      );
    },
    enabled: !!id,
  });
}

export function useUpdateStyleProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      styleProfileApi.updateProfile(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.styleProfiles.detail(variables.id) });
    },
  });
}

export function useCompleteQuiz() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, answers }: { id: string; answers: Record<string, unknown> }) =>
      styleProfileApi.completeQuiz(id, answers),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.styleProfiles.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.styleProfiles.versions(variables.id) });
    },
  });
}

export function useAddSignals() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, signals }: { id: string; signals: unknown[] }) =>
      styleProfileApi.addSignals(id, signals),
    onSuccess: (_, variables) => {
      // Invalidate profile to trigger recompute
      queryClient.invalidateQueries({ queryKey: queryKeys.styleProfiles.detail(variables.id) });
    },
  });
}

export function useRestoreVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      styleProfileApi.restoreVersion(id, version),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.styleProfiles.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.styleProfiles.versions(variables.id) });
    },
  });
}
