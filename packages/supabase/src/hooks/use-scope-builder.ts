import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// SCOPE ROOMS
// ═══════════════════════════════════════════════════════════════════════════

export function useProposalScopeRooms(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-scope-rooms', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_scope_rooms')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!proposalId,
  });
}

export function useAddScopeRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proposalId,
      name,
      roomId,
      roomType,
      dimensions,
      floorAreaSqft,
      budgetCents,
      ffeCategories,
      notes,
    }: {
      proposalId: string;
      name: string;
      roomId?: string;
      roomType?: string;
      dimensions?: string;
      floorAreaSqft?: number;
      budgetCents?: number;
      ffeCategories?: string[];
      notes?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: existing } = await supabase
        .from('proposal_scope_rooms')
        .select('sort_order')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from('proposal_scope_rooms')
        .insert({
          proposal_id: proposalId,
          room_id: roomId || null,
          name,
          room_type: roomType || null,
          dimensions: dimensions || null,
          floor_area_sqft: floorAreaSqft || null,
          budget_cents: budgetCents || 0,
          ffe_categories: ffeCategories || [],
          notes: notes || null,
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-scope-rooms', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
    },
  });
}

export function useUpdateScopeRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      roomId,
      proposalId,
      updates,
    }: {
      roomId: string;
      proposalId: string;
      updates: Record<string, unknown>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_scope_rooms')
        .update(updates)
        .eq('id', roomId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-scope-rooms', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
    },
  });
}

export function useRemoveScopeRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ roomId, proposalId }: { roomId: string; proposalId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('proposal_scope_rooms').delete().eq('id', roomId);
      if (error) throw error;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-scope-rooms', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROPOSAL PHASES
// ═══════════════════════════════════════════════════════════════════════════

export function useProposalPhases(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-phases', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_phases')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!proposalId,
  });
}

export function useAddProposalPhase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proposalId,
      name,
      phaseKey,
      durationWeeks,
      feeCents,
      revisionLimit,
      gateCondition,
      deliverables,
    }: {
      proposalId: string;
      name: string;
      phaseKey?: string;
      durationWeeks?: number;
      feeCents?: number;
      revisionLimit?: number;
      gateCondition?: string;
      deliverables?: Array<{ label: string; type?: string }>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: existing } = await supabase
        .from('proposal_phases')
        .select('sort_order')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from('proposal_phases')
        .insert({
          proposal_id: proposalId,
          name,
          phase_key: phaseKey || null,
          duration_weeks: durationWeeks || null,
          fee_cents: feeCents || 0,
          revision_limit: revisionLimit ?? 2,
          gate_condition: gateCondition || null,
          deliverables: deliverables || [],
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-phases', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
    },
  });
}

export function useUpdateProposalPhase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      phaseId,
      proposalId,
      updates,
    }: {
      phaseId: string;
      proposalId: string;
      updates: Record<string, unknown>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_phases')
        .update(updates)
        .eq('id', phaseId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-phases', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
    },
  });
}

export function useRemoveProposalPhase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ phaseId, proposalId }: { phaseId: string; proposalId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('proposal_phases').delete().eq('id', phaseId);
      if (error) throw error;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-phases', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['scope-builder-summary', proposalId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROPOSAL EXCLUSIONS
// ═══════════════════════════════════════════════════════════════════════════

export function useProposalExclusions(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-exclusions', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_exclusions')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!proposalId,
  });
}

export function useAddExclusion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proposalId,
      description,
      category,
    }: {
      proposalId: string;
      description: string;
      category?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: existing } = await supabase
        .from('proposal_exclusions')
        .select('sort_order')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from('proposal_exclusions')
        .insert({
          proposal_id: proposalId,
          description,
          category: category || null,
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-exclusions', proposalId] });
    },
  });
}

export function useRemoveExclusion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ exclusionId, proposalId }: { exclusionId: string; proposalId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('proposal_exclusions').delete().eq('id', exclusionId);
      if (error) throw error;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-exclusions', proposalId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT MILESTONES
// ═══════════════════════════════════════════════════════════════════════════

export function useProposalPaymentMilestones(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-payment-milestones', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_payment_milestones')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!proposalId,
  });
}

export function useAddPaymentMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proposalId,
      phaseId,
      label,
      percentage,
      amountCents,
      triggerCondition,
    }: {
      proposalId: string;
      phaseId?: string;
      label: string;
      percentage: number;
      amountCents?: number;
      triggerCondition?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: existing } = await supabase
        .from('proposal_payment_milestones')
        .select('sort_order')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from('proposal_payment_milestones')
        .insert({
          proposal_id: proposalId,
          phase_id: phaseId || null,
          label,
          percentage,
          amount_cents: amountCents || 0,
          trigger_condition: triggerCondition || null,
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-payment-milestones', proposalId] });
    },
  });
}

export function useUpdatePaymentMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      milestoneId,
      proposalId,
      updates,
    }: {
      milestoneId: string;
      proposalId: string;
      updates: Record<string, unknown>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_payment_milestones')
        .update(updates)
        .eq('id', milestoneId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-payment-milestones', proposalId] });
    },
  });
}

export function useRemovePaymentMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ milestoneId, proposalId }: { milestoneId: string; proposalId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('proposal_payment_milestones').delete().eq('id', milestoneId);
      if (error) throw error;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-payment-milestones', proposalId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE ORDER TERMS
// ═══════════════════════════════════════════════════════════════════════════

export function useProposalChangeOrderTerms(proposalId: string) {
  return useQuery({
    queryKey: ['proposal-co-terms', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_change_order_terms')
        .select('*')
        .eq('proposal_id', proposalId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!proposalId,
  });
}

export function useUpsertChangeOrderTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proposalId,
      processDescription,
      hourlyRateCents,
      minimumFeeCents,
      approvalRequired,
    }: {
      proposalId: string;
      processDescription: string;
      hourlyRateCents?: number;
      minimumFeeCents?: number;
      approvalRequired?: boolean;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_change_order_terms')
        .upsert(
          {
            proposal_id: proposalId,
            process_description: processDescription,
            hourly_rate_cents: hourlyRateCents || 0,
            minimum_fee_cents: minimumFeeCents || 0,
            approval_required: approvalRequired ?? true,
          },
          { onConflict: 'proposal_id' }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { proposalId }) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-co-terms', proposalId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SCOPE BUILDER SUMMARY (aggregate)
// ═══════════════════════════════════════════════════════════════════════════

export function useScopeBuilderSummary(proposalId: string) {
  return useQuery({
    queryKey: ['scope-builder-summary', proposalId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const [roomsRes, phasesRes, itemsRes] = await Promise.all([
        supabase
          .from('proposal_scope_rooms')
          .select('budget_cents')
          .eq('proposal_id', proposalId),
        supabase
          .from('proposal_phases')
          .select('fee_cents, duration_weeks')
          .eq('proposal_id', proposalId),
        supabase
          .from('proposal_items')
          .select('id')
          .eq('proposal_id', proposalId),
      ]);

      const rooms = roomsRes.data ?? [];
      const phases = phasesRes.data ?? [];
      const items = itemsRes.data ?? [];

      return {
        totalRooms: rooms.length,
        totalFFEItems: items.length,
        totalBudgetCents: rooms.reduce((sum: number, r: { budget_cents: number }) => sum + (r.budget_cents || 0), 0),
        totalDesignFeeCents: phases.reduce((sum: number, p: { fee_cents: number }) => sum + (p.fee_cents || 0), 0),
        totalPhases: phases.length,
        estimatedWeeks: phases.reduce((sum: number, p: { duration_weeks: number | null }) => sum + (p.duration_weeks || 0), 0),
      };
    },
    enabled: !!proposalId,
  });
}
