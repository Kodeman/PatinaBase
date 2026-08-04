import type {
  ClientCommercialDocumentBundle,
  DesignServiceRate,
  DesignServiceTerms,
  DesignServicesExecutionResult,
  FurnishingsAuthorization,
  FurnishingsAuthorizationDraftResult,
  ProjectBillingAuthoritySummary,
  WorkingBudgetCheckpoint,
  WorkingBudgetVersion,
} from '@patina/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

function normalizeWorkingBudget(
  data: unknown,
  projectId: string,
): { version: WorkingBudgetVersion; checkpoint: WorkingBudgetCheckpoint | null } | null {
  if (!data || typeof data !== 'object') return null;
  // RPC responses are deliberately client-safe camelCase payloads, but their
  // status vocabulary follows the persisted schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = data as any;
  if (!payload.version || typeof payload.version !== 'object') return null;

  const rawVersion = payload.version;
  const versionId = String(rawVersion.id ?? '');
  const rawLines = Array.isArray(payload.lines)
    ? payload.lines
    : Array.isArray(rawVersion.lines)
      ? rawVersion.lines
      : [];
  const version: WorkingBudgetVersion = {
    id: versionId,
    projectId: String(rawVersion.projectId ?? rawVersion.project_id ?? projectId),
    version: Number(rawVersion.version ?? 0),
    state:
      rawVersion.state === 'superseded'
        ? 'superseded'
        : (rawVersion.state ?? rawVersion.status) === 'published'
          ? 'published'
          : 'draft',
    currency: String(rawVersion.currency ?? 'USD'),
    lowTotalCents: Number(rawVersion.lowTotalCents ?? rawVersion.low_total_cents ?? 0),
    targetTotalCents: Number(rawVersion.targetTotalCents ?? rawVersion.target_total_cents ?? 0),
    highTotalCents: Number(rawVersion.highTotalCents ?? rawVersion.high_total_cents ?? 0),
    lines: rawLines.map((line: Record<string, unknown>) => ({
      id: String(line.id ?? ''),
      versionId: String(line.versionId ?? line.budget_version_id ?? versionId),
      roomId: (line.roomId ?? line.projectRoomId ?? line.project_room_id ?? null) as string | null,
      roomName: String(line.roomName ?? line.room_name ?? ''),
      category: String(line.category ?? ''),
      lowCents: Number(line.lowCents ?? line.low_cents ?? 0),
      targetCents: Number(line.targetCents ?? line.target_cents ?? 0),
      highCents: Number(line.highCents ?? line.high_cents ?? 0),
      notes: (line.notes ?? null) as string | null,
      sortOrder: Number(line.sortOrder ?? line.sort_order ?? 0),
    })),
    createdAt: String(
      rawVersion.createdAt ?? rawVersion.created_at ?? rawVersion.publishedAt ??
        rawVersion.published_at ?? '',
    ),
    publishedAt: (rawVersion.publishedAt ?? rawVersion.published_at ?? null) as string | null,
  };

  const rawCheckpoint = payload.checkpoint;
  if (!rawCheckpoint || typeof rawCheckpoint !== 'object') {
    return { version, checkpoint: null };
  }
  const rawState = rawCheckpoint.state ?? rawCheckpoint.status;
  const checkpoint: WorkingBudgetCheckpoint = {
    id: String(rawCheckpoint.id ?? ''),
    projectId: String(rawCheckpoint.projectId ?? rawCheckpoint.project_id ?? projectId),
    versionId: String(
      rawCheckpoint.versionId ?? rawCheckpoint.budgetVersionId ??
        rawCheckpoint.budget_version_id ?? versionId,
    ),
    state:
      rawState === 'acknowledged'
        ? 'acknowledged'
        : rawState === 'overridden'
          ? 'overridden'
          : 'published',
    publishedAt: String(
      rawCheckpoint.publishedAt ?? rawCheckpoint.published_at ?? version.publishedAt ?? '',
    ),
    acknowledgedAt: (rawCheckpoint.acknowledgedAt ??
      rawCheckpoint.acknowledged_at ?? null) as string | null,
    acknowledgedBy: (rawCheckpoint.acknowledgedBy ??
      rawCheckpoint.acknowledged_by ?? null) as string | null,
    overrideAt: (rawCheckpoint.overrideAt ?? rawCheckpoint.overriddenAt ??
      rawCheckpoint.overridden_at ?? null) as string | null,
    overrideBy: (rawCheckpoint.overrideBy ?? rawCheckpoint.override_by ?? null) as string | null,
    overrideReason: (rawCheckpoint.overrideReason ??
      rawCheckpoint.override_reason ?? null) as string | null,
  };
  return { version, checkpoint };
}

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
  sendSnapshot: (documentId: string) =>
    ['commercial-documents', documentId, 'send-snapshot'] as const,
};

export interface CommercialDocumentSendSnapshot {
  proposalId: string;
  updatedAt: string;
  documentFingerprint: string;
}

export interface SendCommercialDocumentResult {
  proposalId: string;
  documentKind: string;
  commercialState: string;
  sentAt: string;
  proposalSendDispatchId: string | null;
  documentFingerprint: string;
}

export function useUpsertDesignServicesDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proposalId,
      terms,
      rates,
    }: {
      proposalId: string;
      terms: DesignServiceTerms;
      rates: DesignServiceRate[];
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('upsert_design_services_draft', {
        p_proposal_id: proposalId,
        p_terms: {
          scope: terms.scope,
          deliverables: terms.deliverables,
          exclusions: terms.exclusions,
          billingCeilingCents: terms.billingCeilingCents,
          retainerAmountCents: terms.retainerAmountCents,
          retainerActivationPolicy: terms.retainerActivationPolicy,
          billingCadence: terms.billingCadence,
          currency: terms.currency,
          terms: terms.terms,
          currentRateVersion: terms.currentRateVersion,
        },
        p_rates: rates.map((rate, sortOrder) => ({
          roleName: rate.roleName,
          hourlyRateCents: rate.hourlyRateCents,
          sortOrder,
          effectiveAt: rate.effectiveAt,
        })),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: commercialKeys.document(proposalId) });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      queryClient.invalidateQueries({ queryKey: commercialKeys.sendSnapshot(proposalId) });
    },
  });
}

export function useCommercialDocumentSendSnapshot(documentId: string) {
  return useQuery({
    queryKey: commercialKeys.sendSnapshot(documentId),
    enabled: !!documentId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('get_commercial_document_send_snapshot', {
        p_proposal_id: documentId,
      });
      if (error) throw error;
      return data as CommercialDocumentSendSnapshot;
    },
  });
}

export function useSendCommercialDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proposalId,
      expectedFingerprint,
      personalMessage,
      validUntil,
    }: {
      proposalId: string;
      expectedFingerprint: string;
      personalMessage?: string;
      validUntil?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('send_commercial_document', {
        p_proposal_id: proposalId,
        p_expected_fingerprint: expectedFingerprint,
        p_personal_message: personalMessage?.trim() || null,
        p_valid_until: validUntil ?? null,
      });
      if (error) throw error;
      const result = data as SendCommercialDocumentResult;
      if (result.sentAt && result.proposalSendDispatchId) {
        await supabase.functions.invoke('proposal-send', {
          body: {
            proposalId,
            sentAt: result.sentAt,
            dispatchId: result.proposalSendDispatchId,
          },
        });
      }
      return result;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: commercialKeys.document(proposalId) });
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId] });
      queryClient.invalidateQueries({ queryKey: commercialKeys.sendSnapshot(proposalId) });
      queryClient.invalidateQueries({ queryKey: ['document-state'] });
      queryClient.invalidateQueries({ queryKey: ['desk-engagements'] });
    },
  });
}

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
      return normalizeWorkingBudget(data, projectId);
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
      return data as FurnishingsAuthorizationDraftResult;
    },
    onSuccess: (_, { projectId }) => invalidateProjectCommerce(queryClient, projectId),
  });
}
