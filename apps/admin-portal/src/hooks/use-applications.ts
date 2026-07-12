import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applicationsService,
  type Application,
  type ApplicationType,
  type ApplicationStatus,
  type ApplicationsFilters,
  type DesignerApplication,
  type MakerApplication,
} from '@/services/applications';

export const applicationKeys = {
  all: ['applications'] as const,
  list: (type: ApplicationType, filters?: ApplicationsFilters) =>
    [...applicationKeys.all, type, 'list', filters] as const,
  detail: (type: ApplicationType, id: string) =>
    [...applicationKeys.all, type, 'detail', id] as const,
};

export function useDesignerApplications(filters?: ApplicationsFilters) {
  return useQuery({
    queryKey: applicationKeys.list('designer', filters),
    queryFn: () => applicationsService.list<DesignerApplication>('designer', filters),
  });
}

export function useMakerApplications(filters?: ApplicationsFilters) {
  return useQuery({
    queryKey: applicationKeys.list('maker', filters),
    queryFn: () => applicationsService.list<MakerApplication>('maker', filters),
  });
}

export function useApplication<T extends Application = Application>(
  type: ApplicationType,
  id: string | null | undefined,
) {
  return useQuery({
    queryKey: applicationKeys.detail(type, id ?? ''),
    queryFn: () => applicationsService.get<T>(type, id as string),
    enabled: !!id,
  });
}

export function useUpdateApplication(type: ApplicationType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; status?: ApplicationStatus; reviewNotes?: string }) =>
      applicationsService.update(type, input.id, {
        status: input.status,
        reviewNotes: input.reviewNotes,
      }),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: applicationKeys.all });
      qc.invalidateQueries({ queryKey: applicationKeys.detail(type, input.id) });
    },
  });
}

export function useOnboardApplication(type: ApplicationType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      displayName?: string;
      roleName?: string;
      additionalRoleIds?: string[];
      personalObservation?: string;
    }) =>
      applicationsService.onboard(type, input.id, {
        displayName: input.displayName,
        roleName: input.roleName,
        additionalRoleIds: input.additionalRoleIds,
        personalObservation: input.personalObservation,
      }),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: applicationKeys.all });
      qc.invalidateQueries({ queryKey: applicationKeys.detail(type, input.id) });
    },
  });
}

export function useSendApplicationEmail(type: ApplicationType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      subject: string;
      html: string;
      text?: string;
      presetSlug?: string;
    }) =>
      applicationsService.sendEmail(type, input.id, {
        subject: input.subject,
        html: input.html,
        text: input.text,
        presetSlug: input.presetSlug,
      }),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: applicationKeys.detail(type, input.id) });
    },
  });
}
