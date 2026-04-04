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

export function useCreateScopeChangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
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

export function useSendScopeChangeRequest() {
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
