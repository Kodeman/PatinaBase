'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { commercialKeys, createBrowserClient } from '@patina/supabase';
import {
  adaptCommercialDocumentBundle,
  adaptProjectCommercialSummary,
  type CommercialDocumentBundle,
  type ProjectCommercialSummary,
} from '@/lib/commercial-documents';

// The Wave 1 RPCs intentionally return hand-curated JSON rather than database
// rows. Keep their untrusted response at this boundary until the allowlist
// adapters have removed internal-only keys.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

export function useClientCommercialDocument(proposalId: string) {
  return useQuery<CommercialDocumentBundle | null>({
    queryKey: commercialKeys.clientBundle(proposalId),
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('get_client_commercial_document_bundle', {
        p_proposal_id: proposalId,
      });
      if (error) throw error;
      return adaptCommercialDocumentBundle(data);
    },
  });
}

export function useProjectCommercialSummary(projectId: string) {
  return useQuery<ProjectCommercialSummary>({
    queryKey: ['project-commercial-summary', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const supabase = getSupabase();
      const [authorityResult, budgetResult, furnishingsResult] = await Promise.all([
        supabase.rpc('get_project_authority_summary', { p_project_id: projectId }),
        supabase.rpc('get_project_working_budget', { p_project_id: projectId }),
        supabase.rpc('list_furnishings_authorizations', { p_project_id: projectId }),
      ]);

      const error = authorityResult.error ?? budgetResult.error ?? furnishingsResult.error;
      if (error) throw error;

      return adaptProjectCommercialSummary({
        projectId,
        authority: authorityResult.data,
        workingBudget: budgetResult.data,
        furnishingsAuthorizations: Array.isArray(furnishingsResult.data)
          ? furnishingsResult.data
          : [],
      });
    },
  });
}

export function useAcknowledgeBudgetCheckpoint(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (checkpointId: string) => {
      const response = await fetch(
        `/api/projects/${projectId}/budget-checkpoints/${checkpointId}/acknowledge`,
        { method: 'POST' },
      );
      const body = (await response.json().catch(() => ({}))) as {
        checkpointId?: string;
        status?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || 'Unable to acknowledge the working budget.');
      return body;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['project-commercial-summary', projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: commercialKeys.budget(projectId),
        }),
      ]);
    },
  });
}

export async function invalidateSignedCommercialDocument(
  queryClient: ReturnType<typeof useQueryClient>,
  proposalId: string,
  projectId: string | null,
): Promise<void> {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: commercialKeys.clientBundle(proposalId) }),
    // Prefix invalidation refreshes the client-safe detail bundle.
    queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] }),
    queryClient.invalidateQueries({ queryKey: ['proposals'] }),
  ];
  if (projectId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ['project-commercial-summary', projectId] }),
      queryClient.invalidateQueries({ queryKey: commercialKeys.waves(projectId) }),
    );
  }
  await Promise.all(invalidations);
}
