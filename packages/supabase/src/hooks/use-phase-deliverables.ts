import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// PHASE DELIVERABLES (proposal_phase_deliverables — see migration 00133)
// ═══════════════════════════════════════════════════════════════════════════

export interface PhaseDeliverable {
  id: string;
  phase_id: string;
  label: string;
  description: string | null;
  is_required: boolean;
  completed_at: string | null;
  completed_by: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function usePhaseDeliverables(phaseId: string) {
  return useQuery<PhaseDeliverable[]>({
    queryKey: ['phase-deliverables', phaseId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_phase_deliverables')
        .select('*')
        .eq('phase_id', phaseId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PhaseDeliverable[];
    },
    enabled: !!phaseId,
  });
}

export function useAddDeliverable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      phaseId,
      label,
      description,
      isRequired,
    }: {
      phaseId: string;
      label: string;
      description?: string;
      isRequired?: boolean;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: existing } = await supabase
        .from('proposal_phase_deliverables')
        .select('sort_order')
        .eq('phase_id', phaseId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from('proposal_phase_deliverables')
        .insert({
          phase_id: phaseId,
          label,
          description: description ?? null,
          is_required: isRequired ?? true,
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data as PhaseDeliverable;
    },
    onSuccess: (_, { phaseId }) => {
      queryClient.invalidateQueries({ queryKey: ['phase-deliverables', phaseId] });
    },
  });
}

export function useUpdateDeliverable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      deliverableId,
      updates,
    }: {
      deliverableId: string;
      phaseId: string;
      updates: Partial<PhaseDeliverable>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_phase_deliverables')
        .update(updates)
        .eq('id', deliverableId)
        .select()
        .single();
      if (error) throw error;
      return data as PhaseDeliverable;
    },
    onSuccess: (_, { phaseId }) => {
      queryClient.invalidateQueries({ queryKey: ['phase-deliverables', phaseId] });
    },
  });
}

export function useToggleDeliverableCompleted() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      deliverableId,
      completed,
    }: {
      deliverableId: string;
      phaseId: string;
      completed: boolean;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let userId: string | null = null;
      if (completed) {
        const { data: userRes } = await supabase.auth.getUser();
        userId = userRes?.user?.id ?? null;
      }

      const updates = completed
        ? {
            completed_at: new Date().toISOString(),
            completed_by: userId,
          }
        : {
            completed_at: null,
            completed_by: null,
          };

      const { data, error } = await supabase
        .from('proposal_phase_deliverables')
        .update(updates)
        .eq('id', deliverableId)
        .select()
        .single();
      if (error) throw error;
      return data as PhaseDeliverable;
    },
    onSuccess: (_, { phaseId }) => {
      queryClient.invalidateQueries({ queryKey: ['phase-deliverables', phaseId] });
      queryClient.invalidateQueries({ queryKey: ['phase-gates', phaseId] });
    },
  });
}

export function useReorderDeliverables() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      phaseId,
      orderedIds,
    }: {
      phaseId: string;
      orderedIds: string[];
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Bulk-update sort_order. There is no batch endpoint, so we issue
      // one update per row. Order matters — write in the new index order.
      for (let i = 0; i < orderedIds.length; i++) {
        const id = orderedIds[i];
        const { error } = await supabase
          .from('proposal_phase_deliverables')
          .update({ sort_order: i })
          .eq('id', id)
          .eq('phase_id', phaseId);
        if (error) throw error;
      }
      return { phaseId, count: orderedIds.length };
    },
    onSuccess: (_, { phaseId }) => {
      queryClient.invalidateQueries({ queryKey: ['phase-deliverables', phaseId] });
    },
  });
}

export function useDeleteDeliverable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      deliverableId,
    }: {
      deliverableId: string;
      phaseId: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase
        .from('proposal_phase_deliverables')
        .delete()
        .eq('id', deliverableId);
      if (error) throw error;
      return { deliverableId };
    },
    onSuccess: (_, { phaseId }) => {
      queryClient.invalidateQueries({ queryKey: ['phase-deliverables', phaseId] });
    },
  });
}
