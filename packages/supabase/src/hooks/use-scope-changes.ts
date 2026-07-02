import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

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
    mutationFn: async ({
      requestId,
      projectId,
    }: {
      requestId: string;
      projectId: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('scope_change_requests')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', requestId)
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
      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('scope_change_requests')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: user.user?.id || null,
          approved_by_name: approvedByName,
          approved_ip: approvedIp || null,
        })
        .eq('id', requestId)
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
      const { data, error } = await supabase
        .from('scope_change_requests')
        .update({
          status: 'declined',
          declined_at: new Date().toISOString(),
          decline_reason: declineReason || null,
        })
        .eq('id', requestId)
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

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT-INITIATED MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Client submits a scope change request. Creates the row with status='sent'
 * so the designer sees it immediately. Budget/timeline impact defaults to 0 —
 * the designer fills those in when they review.
 */
export function useCreateClientScopeChangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      title,
      description,
    }: {
      projectId: string;
      title: string;
      description: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 1. Insert the scope_change_requests row.
      const { data: req, error: reqErr } = await supabase
        .from('scope_change_requests')
        .insert({
          project_id: projectId,
          requested_by: user.id,
          title,
          description,
          additional_ffe_budget_cents: 0,
          additional_design_fee_cents: 0,
          timeline_impact_weeks: 0,
          new_rooms: [],
          new_ffe_items: [],
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (reqErr) throw reqErr;

      // 2. Look up the designer_clients row that links this client + project designer.
      const { data: project } = await supabase
        .from('projects')
        .select('designer_id, client_id, name')
        .eq('id', projectId)
        .maybeSingle();

      if (project?.designer_id && project?.client_id) {
        const { data: dc } = await supabase
          .from('designer_clients')
          .select('id')
          .eq('designer_id', project.designer_id)
          .eq('client_id', project.client_id)
          .maybeSingle();

        if (dc?.id) {
          // 3. Insert client_activity_log so the designer's project Recent Activity surfaces it.
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .maybeSingle();

          await supabase.from('client_activity_log').insert({
            designer_client_id: dc.id,
            activity_type: 'scope_change_requested',
            title: `Client requested change: ${title}`,
            description: description.slice(0, 500),
            metadata: { project_id: projectId, change_id: req.id },
            actor_name: profile?.full_name ?? null,
          });
        }
      }

      return req;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['scope-changes', vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-activity-from-log', vars.projectId] });
    },
  });
}

/**
 * Client cancels their own scope-change request while still in draft/sent/viewed state.
 * Backed by RLS policy at migration 00114.
 */
export function useCancelClientScopeChangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      projectId,
    }: {
      requestId: string;
      projectId: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('scope_change_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId)
        .select()
        .single();
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
 * Apply an approved scope change to the project.
 * Materializes new rooms and FFE items, updates budget/timeline.
 */
export function useApplyScopeChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      projectId,
    }: {
      requestId: string;
      projectId: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Fetch the request
      const { data: request, error: fetchErr } = await supabase
        .from('scope_change_requests')
        .select('*')
        .eq('id', requestId)
        .single();
      if (fetchErr) throw fetchErr;
      if (request.status !== 'approved') throw new Error('Scope change must be approved before applying');

      // Add new rooms
      const newRooms = request.new_rooms || [];
      const roomIdMap: Record<string, string> = {};
      for (const room of newRooms) {
        const { data: newRoom } = await supabase
          .from('project_rooms')
          .insert({
            project_id: projectId,
            name: room.name,
            room_type: room.roomType || room.room_type || null,
            dimensions: room.dimensions || null,
            budget_cents: room.budgetCents || room.budget_cents || 0,
            ffe_categories: room.ffeCategories || room.ffe_categories || [],
          })
          .select()
          .single();
        if (newRoom) roomIdMap[room.name] = newRoom.id;
      }

      // Add new FFE items
      const newItems = request.new_ffe_items || [];
      for (const item of newItems) {
        await supabase.from('project_ffe_items').insert({
          project_id: projectId,
          project_room_id: item.roomName ? roomIdMap[item.roomName] || null : null,
          name: item.name,
          ffe_category: item.ffeCategory || item.ffe_category || null,
          item_type: item.itemType || item.item_type || 'tbd',
          status: 'specified',
          quantity: item.quantity || 1,
          unit_price_cents: item.unitPriceCents || item.unit_price_cents || 0,
          line_total_cents: (item.unitPriceCents || item.unit_price_cents || 0) * (item.quantity || 1),
        });
      }

      // Update project budget
      const { data: project } = await supabase
        .from('projects')
        .select('budget_cents, design_fee_cents')
        .eq('id', projectId)
        .single();

      if (project) {
        await supabase
          .from('projects')
          .update({
            budget_cents: (project.budget_cents || 0) + (request.additional_ffe_budget_cents || 0) + (request.additional_design_fee_cents || 0),
            design_fee_cents: (project.design_fee_cents || 0) + (request.additional_design_fee_cents || 0),
          })
          .eq('id', projectId);
      }

      // Mark as applied
      await supabase
        .from('scope_change_requests')
        .update({ applied_at: new Date().toISOString() })
        .eq('id', requestId);

      return { projectId, requestId };
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['scope-changes', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-v2', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-rooms', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-ffe-items', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-financials', projectId] });
    },
  });
}
