import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

export const COMPLETED_PROJECT_SCOPE_CHANGE_ERROR =
  'This project is complete and no longer accepts change requests.';

export interface ClientScopeChangeRequestReceipt {
  id: string;
  project_id: string;
  status: 'sent';
  sent_at: string;
}

function parseClientScopeChangeReceipt(value: unknown): ClientScopeChangeRequestReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('create_client_scope_change_request returned a malformed receipt');
  }
  const receipt = value as Record<string, unknown>;
  const keys = Object.keys(receipt).sort();
  if (
    keys.join(',') !== 'id,project_id,sent_at,status' ||
    typeof receipt.id !== 'string' ||
    typeof receipt.project_id !== 'string' ||
    receipt.status !== 'sent' ||
    typeof receipt.sent_at !== 'string'
  ) {
    throw new Error('create_client_scope_change_request returned a malformed receipt');
  }
  return receipt as unknown as ClientScopeChangeRequestReceipt;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════

export function useScopeChangeRequests(projectId: string) {
  return useQuery({
    queryKey: ['scope-changes', projectId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('scope_change_requests')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

export function useScopeChangeRequest(requestId: string) {
  return useQuery({
    queryKey: ['scope-change', requestId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('scope_change_requests')
        .select('*')
        .eq('id', requestId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!requestId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// DESIGNER MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

export function useCreateScopeChangeRequest(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();
  return useMutation({
    // R83: document surfaces render failures inline at the act site and pass
    // { errorSurface: 'inline' } to keep the global error toast quiet.
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({
      projectId,
      proposalId,
      title,
      description,
      additionalFfeBudgetCents,
      additionalDesignFeeCents,
      timelineImpactWeeks,
      newTotalBudgetCents,
      newRooms,
      newFfeItems,
    }: {
      projectId: string;
      proposalId?: string;
      title: string;
      description: string;
      additionalFfeBudgetCents?: number;
      additionalDesignFeeCents?: number;
      timelineImpactWeeks?: number;
      newTotalBudgetCents?: number;
      newRooms?: Array<Record<string, unknown>>;
      newFfeItems?: Array<Record<string, unknown>>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('scope_change_requests')
        .insert({
          project_id: projectId,
          proposal_id: proposalId || null,
          requested_by: user.user.id,
          title,
          description,
          additional_ffe_budget_cents: additionalFfeBudgetCents || 0,
          additional_design_fee_cents: additionalDesignFeeCents || 0,
          timeline_impact_weeks: timelineImpactWeeks || 0,
          new_total_budget_cents: newTotalBudgetCents || 0,
          new_rooms: newRooms || [],
          new_ffe_items: newFfeItems || [],
          status: 'draft',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['scope-changes', projectId] });
    },
  });
}

export function useSendScopeChangeRequest(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();
  return useMutation({
    // R83 — see useCreateScopeChangeRequest.
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({ requestId, projectId }: { requestId: string; projectId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('send_scope_change_request', {
        p_request_id: requestId,
        p_project_id: projectId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['scope-changes', projectId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

export function useApproveScopeChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      projectId,
      approvedByName,
      approvedIp,
    }: {
      requestId: string;
      projectId: string;
      approvedByName: string;
      approvedIp?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('approve_scope_change_request', {
        p_request_id: requestId,
        p_project_id: projectId,
        p_approved_by_name: approvedByName,
        p_approved_ip: approvedIp || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['scope-changes', projectId] });
    },
  });
}

/**
 * A project designer/design-studio peer accepts a client-origin request.
 * The approved artifact can then be fulfilled through useApplyScopeChange.
 */
export function useAcceptClientScopeChangeRequest(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({ requestId, projectId }: { requestId: string; projectId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('accept_client_scope_change_request', {
        p_request_id: requestId,
        p_project_id: projectId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { projectId, requestId }) => {
      queryClient.invalidateQueries({ queryKey: ['scope-changes', projectId] });
      queryClient.invalidateQueries({ queryKey: ['scope-change', requestId] });
    },
  });
}

export function useDeclineScopeChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      projectId,
      declineReason,
    }: {
      requestId: string;
      projectId: string;
      declineReason?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('decline_scope_change_request', {
        p_request_id: requestId,
        p_project_id: projectId,
        p_decline_reason: declineReason || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['scope-changes', projectId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT-INITIATED MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Client submits a scope change request through the 00395 project-locked RPC.
 * The RPC owns authorization, completed-project rejection, request creation,
 * and the designer activity line in one transaction.
 */
export function useCreateClientScopeChangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      idempotencyKey,
      title,
      description,
    }: {
      projectId: string;
      idempotencyKey: string;
      title: string;
      description: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('create_client_scope_change_request', {
        p_project_id: projectId,
        p_idempotency_key: idempotencyKey,
        p_title: title,
        p_description: description,
      });
      if (error) {
        if (String(error.message ?? error).includes('completed_project')) {
          throw new Error(COMPLETED_PROJECT_SCOPE_CHANGE_ERROR);
        }
        throw error;
      }

      return parseClientScopeChangeReceipt(data);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: ['scope-changes', vars.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['project-activity-from-log', vars.projectId],
      });
    },
  });
}

/**
 * A requester cancels their own scope-change request while it is still open.
 * 00395 proves the exact project relationship, requester, and source state.
 */
export function useCancelClientScopeChangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, projectId }: { requestId: string; projectId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('cancel_scope_change_request', {
        p_request_id: requestId,
        p_project_id: projectId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { projectId, requestId }) => {
      queryClient.invalidateQueries({ queryKey: ['scope-changes', projectId] });
      queryClient.invalidateQueries({ queryKey: ['scope-change', requestId] });
    },
  });
}

/**
 * Atomically apply an approved scope change through the checked 00395 RPC.
 * The database materializes rooms/items and updates budget/timeline exactly once.
 */
export function useApplyScopeChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, projectId }: { requestId: string; projectId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.rpc('apply_scope_change', {
        p_request_id: requestId,
      });
      if (error) throw error;

      return { projectId, requestId };
    },
    onSuccess: (_, { projectId, requestId }) => {
      queryClient.invalidateQueries({ queryKey: ['scope-changes', projectId] });
      queryClient.invalidateQueries({ queryKey: ['scope-change', requestId] });
      queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-rooms', projectId] });
      queryClient.invalidateQueries({
        queryKey: ['project-ffe-items', projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['project-financials', projectId],
      });
    },
  });
}
