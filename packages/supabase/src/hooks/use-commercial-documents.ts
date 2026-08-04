import type {
  ClientCommercialDocumentBundle,
  DesignServicesExecutionResult,
  FurnishingsAuthorization,
  FurnishingsExecutionResult,
  ProjectBillingAuthoritySummary,
  WorkingBudgetCheckpoint,
  WorkingBudgetVersion,
} from '@patina/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

async function notifyCommercialTransition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  documentId: string,
  transition:
    | 'executed'
    | 'furnishings_sent'
    | 'furnishings_executed'
    | 'deposit_ready',
) {
  try {
    await supabase.functions?.invoke('commercial-document-notify', {
      body: { documentId, transition },
    });
  } catch (error) {
    // The state transition already committed. Delivery is replay-safe and can
    // be retried without repeating the commercial mutation.
    // eslint-disable-next-line no-console
    console.warn('commercial-document-notify invocation failed', error);
  }
}

export const commercialKeys = {
  all: ['commercial-documents'] as const,
  document: (documentId: string) => ['commercial-documents', documentId] as const,
  clientBundle: (documentId: string) =>
    ['commercial-documents', documentId, 'client-safe'] as const,
  authority: (projectId: string) => ['project-authority', projectId] as const,
  budget: (projectId: string) => ['working-budget', projectId] as const,
  waves: (projectId: string) => ['furnishings-authorizations', projectId] as const,
};

function invalidateProjectCommerce(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
) {
  queryClient.invalidateQueries({ queryKey: commercialKeys.authority(projectId) });
  queryClient.invalidateQueries({ queryKey: commercialKeys.budget(projectId) });
  queryClient.invalidateQueries({ queryKey: commercialKeys.waves(projectId) });
  queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
  queryClient.invalidateQueries({ queryKey: ['hours-ledger', projectId] });
  queryClient.invalidateQueries({ queryKey: ['account-page', projectId] });
}

export function useClientCommercialDocumentBundle(documentId: string) {
  return useQuery({
    queryKey: commercialKeys.clientBundle(documentId),
    enabled: !!documentId,
    queryFn: async () => {
      // Generated RPC types land with the database migration. Keeping this
      // call boundary explicit also prevents portals from reading raw rows.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('get_client_commercial_document_bundle', {
        p_proposal_id: documentId,
      });
      if (error) throw error;
      return data as ClientCommercialDocumentBundle;
    },
  });
}

export function useProjectBillingAuthority(projectId: string) {
  return useQuery({
    queryKey: commercialKeys.authority(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('get_project_authority_summary', {
        p_project_id: projectId,
      });
      if (error) throw error;
      return data as ProjectBillingAuthoritySummary;
    },
  });
}

export function useWorkingBudget(projectId: string) {
  return useQuery({
    queryKey: commercialKeys.budget(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('get_project_working_budget', {
        p_project_id: projectId,
      });
      if (error) throw error;
      return data as {
        version: WorkingBudgetVersion | null;
        checkpoint: WorkingBudgetCheckpoint | null;
      };
    },
  });
}

export function useFurnishingsAuthorizations(projectId: string) {
  return useQuery({
    queryKey: commercialKeys.waves(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('list_furnishings_authorizations', {
        p_project_id: projectId,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as FurnishingsAuthorization[];
    },
  });
}

export function useCountersignDesignServicesAgreement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ proposalId, signerName }: { proposalId: string; signerName: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('countersign_design_services_agreement', {
        p_proposal_id: proposalId,
        p_signer_name: signerName,
      });
      if (error) throw error;
      const result = data as DesignServicesExecutionResult;
      if (result.newlyExecuted) {
        await notifyCommercialTransition(supabase, proposalId, 'executed');
      }
      return result;
    },
    onSuccess: (result, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: commercialKeys.document(proposalId) });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['document-state'] });
      queryClient.invalidateQueries({ queryKey: ['desk-engagements'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      invalidateProjectCommerce(queryClient, result.projectId);
    },
  });
}

export function usePublishBudgetCheckpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, versionId }: { projectId: string; versionId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('publish_budget_checkpoint', {
        p_project_id: projectId,
        p_version_id: versionId,
      });
      if (error) throw error;
      return data as WorkingBudgetCheckpoint;
    },
    onSuccess: (_, { projectId }) => invalidateProjectCommerce(queryClient, projectId),
  });
}

export function useAcknowledgeBudgetCheckpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, checkpointId }: { projectId: string; checkpointId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('acknowledge_budget_checkpoint', {
        p_checkpoint_id: checkpointId,
      });
      if (error) throw error;
      return data as WorkingBudgetCheckpoint;
    },
    onSuccess: (_, { projectId }) => invalidateProjectCommerce(queryClient, projectId),
  });
}

export function useOverrideBudgetCheckpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      checkpointId,
      reason,
    }: {
      projectId: string;
      checkpointId: string;
      reason: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('override_budget_checkpoint', {
        p_checkpoint_id: checkpointId,
        p_reason: reason,
      });
      if (error) throw error;
      return data as WorkingBudgetCheckpoint;
    },
    onSuccess: (_, { projectId }) => invalidateProjectCommerce(queryClient, projectId),
  });
}

export function useCreateFurnishingsAuthorization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      waveName,
      sourceProposalId,
    }: {
      projectId: string;
      waveName: string;
      sourceProposalId?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('create_furnishings_authorization', {
        p_project_id: projectId,
        p_wave_name: waveName,
        p_source_proposal_id: sourceProposalId ?? null,
      });
      if (error) throw error;
      const result = data as FurnishingsAuthorization;
      await notifyCommercialTransition(supabase, result.id, 'furnishings_sent');
      return result;
    },
    onSuccess: (_, { projectId }) => invalidateProjectCommerce(queryClient, projectId),
  });
}

export function useExecuteFurnishingsAuthorization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, signerName }: { documentId: string; signerName: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('execute_furnishings_authorization', {
        p_proposal_id: documentId,
        p_signed_name: signerName,
      });
      if (error) throw error;
      const result = data as FurnishingsExecutionResult;
      if (result.newlyExecuted) {
        await notifyCommercialTransition(supabase, documentId, 'furnishings_executed');
      }
      return result;
    },
    onSuccess: (result, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: commercialKeys.document(documentId) });
      invalidateProjectCommerce(queryClient, result.projectId);
    },
  });
}
